-- Lilac Desk order portal: database schema
-- Run once in Supabase: SQL Editor > New query > paste > Run.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------

create table public.admins (
  email text primary key
);

create or replace function public.current_email()
returns text language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where lower(email) = public.current_email());
$$;

create or replace function public.try_uuid(value text)
returns uuid language plpgsql immutable as $$
begin
  return value::uuid;
exception when others then
  return null;
end $$;

create or replace function public.tier_days(t text)
returns int language sql immutable as $$
  select case t when 'basic' then 7 when 'standard' then 12 when 'premium' then 21 end;
$$;

-- ---------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  shopify_order_id bigint not null,
  shopify_order_name text,
  shopify_line_item_id bigint not null,
  copy_index int not null default 0,
  customer_email text not null,
  customer_name text,
  license text not null check (license in ('personal', 'commercial')),
  tier text not null check (tier in ('basic', 'standard', 'premium')),
  stage text not null default 'order_placed' check (stage in (
    'order_placed', 'brief_received', 'designing', 'proof_ready',
    'revisions', 'approved', 'delivered', 'complete', 'closed'
  )),
  brief jsonb not null default '{}'::jsonb,
  brief_submitted_at timestamptz,
  due_at timestamptz,
  revisions_included int not null default 0,
  revisions_used int not null default 0,
  delivered_at timestamptz,
  last_customer_activity_at timestamptz not null default now(),
  last_notified_customer_at timestamptz,
  last_notified_admin_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shopify_line_item_id, copy_index)
);
create index orders_customer_email_idx on public.orders (lower(customer_email));

create table public.addons (
  key text primary key,
  name text not null,
  description text,
  personal_price text,
  commercial_price text,
  personal_variant_id bigint,
  commercial_variant_id bigint,
  commercial_only boolean not null default false,
  tiers text[],          -- null = every tier
  dated_only boolean not null default false,
  sort int not null default 100
);

create table public.order_addons (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders on delete cascade,
  addon_key text references public.addons on delete set null,
  name text not null,
  quantity int not null default 1,
  shopify_order_id bigint,
  shopify_line_item_id bigint unique,
  created_at timestamptz not null default now()
);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders on delete cascade,
  kind text not null check (kind in ('chat', 'brief', 'proof', 'final', 'source')),
  path text not null unique,
  name text not null,
  size bigint,
  uploaded_by text not null check (uploaded_by in ('customer', 'admin')),
  created_at timestamptz not null default now()
);
create index files_order_idx on public.files (order_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders on delete cascade,
  sender text not null check (sender in ('customer', 'admin', 'system')),
  kind text not null default 'message' check (kind in ('message', 'revision_request', 'approval')),
  body text not null default '',
  file_id uuid references public.files on delete set null,
  created_at timestamptz not null default now()
);
create index messages_order_idx on public.messages (order_id, created_at);

-- ---------------------------------------------------------------
-- Ownership helpers (used by security rules)
-- ---------------------------------------------------------------

create or replace function public.owns_order(oid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.orders
    where id = oid and lower(customer_email) = public.current_email()
  );
$$;

create or replace function public.order_released(oid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.orders where id = oid and stage in ('delivered', 'complete')
  );
$$;

-- ---------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger orders_touch before update on public.orders
for each row execute function public.touch_updated_at();

create or replace function public.track_customer_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.sender = 'customer' then
    update public.orders set last_customer_activity_at = now() where id = new.order_id;
  end if;
  return new;
end $$;

create trigger messages_customer_activity after insert on public.messages
for each row execute function public.track_customer_activity();

-- ---------------------------------------------------------------
-- Customer actions (run with checks, so customers never edit orders directly)
-- ---------------------------------------------------------------

create or replace function public.save_brief(p_order uuid, p_brief jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.owns_order(p_order) then raise exception 'Order not found'; end if;
  update public.orders
     set brief = p_brief, last_customer_activity_at = now()
   where id = p_order and brief_submitted_at is null;
  if not found then raise exception 'This brief has already been submitted'; end if;
end $$;

create or replace function public.submit_brief(p_order uuid, p_brief jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  d int;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null or not public.owns_order(p_order) then raise exception 'Order not found'; end if;
  if o.brief_submitted_at is not null then raise exception 'This brief has already been submitted'; end if;

  d := public.tier_days(o.tier);
  if exists (select 1 from public.order_addons where order_id = p_order and addon_key = 'rush') then
    d := ceil(d / 2.0);
  end if;

  update public.orders
     set brief = p_brief,
         brief_submitted_at = now(),
         stage = 'brief_received',
         due_at = now() + make_interval(days => d),
         last_customer_activity_at = now()
   where id = p_order;

  insert into public.messages (order_id, sender, body)
  values (p_order, 'system', 'Brief submitted. Your delivery countdown has started.');
end $$;

create or replace function public.request_revision(p_order uuid, p_notes text)
returns void language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null or not public.owns_order(p_order) then raise exception 'Order not found'; end if;
  if o.stage <> 'proof_ready' then raise exception 'There is no proof waiting for review'; end if;
  if o.revisions_used >= o.revisions_included then
    raise exception 'All revision rounds have been used. Add an extra revision round to request more changes.';
  end if;
  if coalesce(trim(p_notes), '') = '' then raise exception 'Please list the changes you want'; end if;

  update public.orders
     set revisions_used = revisions_used + 1, stage = 'revisions'
   where id = p_order;

  insert into public.messages (order_id, sender, kind, body)
  values (p_order, 'customer', 'revision_request', p_notes);
end $$;

create or replace function public.approve_proof(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null or not public.owns_order(p_order) then raise exception 'Order not found'; end if;
  if o.stage <> 'proof_ready' then raise exception 'There is no proof waiting for approval'; end if;

  update public.orders set stage = 'approved' where id = p_order;

  insert into public.messages (order_id, sender, kind, body)
  values (p_order, 'customer', 'approval', 'Proof approved.');
end $$;

revoke execute on function public.save_brief(uuid, jsonb) from anon;
revoke execute on function public.submit_brief(uuid, jsonb) from anon;
revoke execute on function public.request_revision(uuid, text) from anon;
revoke execute on function public.approve_proof(uuid) from anon;

-- ---------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------

alter table public.admins enable row level security;
alter table public.orders enable row level security;
alter table public.addons enable row level security;
alter table public.order_addons enable row level security;
alter table public.files enable row level security;
alter table public.messages enable row level security;

create policy "admins read admins" on public.admins
  for select to authenticated using (public.is_admin());

create policy "read own orders" on public.orders
  for select to authenticated
  using (public.is_admin() or lower(customer_email) = public.current_email());
create policy "admin updates orders" on public.orders
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin deletes orders" on public.orders
  for delete to authenticated using (public.is_admin());

create policy "read addons" on public.addons
  for select to authenticated using (true);
create policy "admin manages addons" on public.addons
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "read own order addons" on public.order_addons
  for select to authenticated using (public.is_admin() or public.owns_order(order_id));
create policy "admin manages order addons" on public.order_addons
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "read own files" on public.files
  for select to authenticated using (
    public.is_admin()
    or (public.owns_order(order_id)
        and (kind not in ('final', 'source') or public.order_released(order_id)))
  );
create policy "upload files" on public.files
  for insert to authenticated with check (
    public.is_admin()
    or (public.owns_order(order_id) and kind in ('chat', 'brief') and uploaded_by = 'customer')
  );
create policy "admin manages files" on public.files
  for delete to authenticated using (public.is_admin());

create policy "read own messages" on public.messages
  for select to authenticated using (public.is_admin() or public.owns_order(order_id));
create policy "send messages" on public.messages
  for insert to authenticated with check (
    (
      sender = 'customer' and kind = 'message' and public.owns_order(order_id)
      and (file_id is null or exists (
        select 1 from public.files f where f.id = file_id and f.order_id = messages.order_id
      ))
    )
    or (public.is_admin() and sender in ('admin', 'system'))
  );

-- ---------------------------------------------------------------
-- File storage
-- ---------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('order-files', 'order-files', false)
on conflict (id) do nothing;

-- Paths are: <order id>/<kind>/<file name>
create policy "read order files" on storage.objects
  for select to authenticated using (
    bucket_id = 'order-files' and (
      public.is_admin()
      or (
        public.owns_order(public.try_uuid((storage.foldername(name))[1]))
        and (
          (storage.foldername(name))[2] not in ('final', 'source')
          or public.order_released(public.try_uuid((storage.foldername(name))[1]))
        )
      )
    )
  );

create policy "upload order files" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'order-files' and (
      public.is_admin()
      or (
        public.owns_order(public.try_uuid((storage.foldername(name))[1]))
        and (storage.foldername(name))[2] in ('chat', 'brief')
      )
    )
  );

create policy "admin changes order files" on storage.objects
  for update to authenticated using (bucket_id = 'order-files' and public.is_admin());

create policy "admin deletes order files" on storage.objects
  for delete to authenticated using (bucket_id = 'order-files' and public.is_admin());

-- ---------------------------------------------------------------
-- Live updates
-- ---------------------------------------------------------------

alter publication supabase_realtime add table public.orders, public.messages, public.files, public.order_addons;

-- ---------------------------------------------------------------
-- Add-on menu (fill in the Shopify variant IDs once the add-on products exist)
-- ---------------------------------------------------------------

insert into public.addons (key, name, description, personal_price, commercial_price, commercial_only, tiers, dated_only, sort) values
  ('rush', 'Rush delivery', 'Cuts your design time in half', '$30', '$50', false, null, false, 10),
  ('extra_pages', 'Extra pages', '10-page pack, any section or paper style', '$25', '$35', false, null, false, 20),
  ('extra_template', 'Extra custom template', 'Per template, beyond what your tier includes', '$8', '$12', false, null, false, 30),
  ('extra_revision', 'Extra revision round', 'One more round of changes, up to a week', '$10', '$15', false, null, false, 40),
  ('sticker_set', 'Sticker set', '25 matching stickers, GoodNotes or PNG', '$20', '$35', false, array['basic', 'standard'], false, 50),
  ('sticker_both', 'Both sticker formats', 'Your sticker set as GoodNotes and individual PNGs', '$15', '$25', false, null, false, 60),
  ('notebook', 'Matching notebook', 'A digital notebook with your cover and paper styles', '$20', '$35', false, null, false, 70),
  ('journal', 'Matching journal', 'A guided journal in the same design', '$25', '$40', false, null, false, 80),
  ('link_pack', 'Link pack', 'Up to 10 links to websites or Apple Shortcuts', '$25', '$40', false, null, false, 90),
  ('calendar_links', 'Calendar links', 'An add-to-calendar link on every daily page (Google or Apple)', '$60', '$90', false, array['standard', 'premium'], true, 95),
  ('colorway', 'Second colorway', 'The same planner in a second color scheme', '$20', '$35', false, null, false, 100),
  ('undated_version', 'Undated version', 'An undated copy of your dated planner, rebuilt and relinked', '$60', '$90', false, array['standard', 'premium'], true, 110),
  ('additional_year', 'Additional year', 'The same design with the next year''s dates, relinked', '$75', '$115', false, array['standard', 'premium'], true, 120),
  ('both_orientations', 'Portrait and landscape', 'Your planner reformatted in both orientations', '$70', '$105', false, null, false, 130),
  ('important_dates', 'Important dates', 'Birthdays, events, and deadlines filled in', '$10', '$10', false, array['standard', 'premium'], true, 140),
  ('source_files_basic', 'Source files', 'Editable Keynote files for your Basic planner', null, '$60', true, array['basic'], false, 200),
  ('source_files_standard', 'Source files', 'Editable Keynote files for your Standard planner', null, '$150', true, array['standard'], false, 201),
  ('source_files_premium', 'Source files', 'Editable Keynote files for your Premium planner', null, '$250', true, array['premium'], false, 202),
  ('mockups', 'Listing mockups', '5 images of your planner on devices (included with Standard and Premium)', null, '$15', true, array['basic'], false, 210),
  ('listing_copy', 'Listing copy', 'Product title, description, and tags', null, '$25', true, null, false, 220),
  ('cover_variations', 'Cover variations', '3 alternate covers to sell as options', null, '$30', true, null, false, 230),
  ('freebie', 'Freebie sample', 'A 3-page sample to grow your email list', null, '$25', true, null, false, 240),
  ('personalized_copies', 'Personalized copies', 'A name on the cover and welcome page of each copy. Pages, layout, and design stay identical.', null, '$5 each', true, null, false, 250);

-- ---------------------------------------------------------------
-- Make yourself the admin (change the email, then run this line)
-- ---------------------------------------------------------------
-- insert into public.admins (email) values ('you@lilacdesk.com');
