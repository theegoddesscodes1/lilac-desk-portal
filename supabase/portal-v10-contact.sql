-- Lilac Desk portal: messages from the Contact page land in your portal inbox.
-- Run once in Supabase: SQL Editor > New query > paste > Run.

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text,
  topic text not null default 'Something else',
  order_ref text,
  status text not null default 'open' check (status in ('open', 'closed')),
  quote_id uuid references public.quotes on delete set null,
  ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contacts_email_idx on public.contacts (lower(email));
create index if not exists contacts_created_idx on public.contacts (created_at desc);

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts on delete cascade,
  sender text not null check (sender in ('customer', 'admin', 'system')),
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists contact_messages_contact_idx on public.contact_messages (contact_id);

alter table public.contacts enable row level security;
alter table public.contact_messages enable row level security;

create or replace function public.owns_contact(p_contact uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.contacts where id = p_contact and lower(email) = public.current_email());
$$;

-- New messages only arrive through the portal-contact function (service role), so visitors can't write directly.
drop policy if exists "read own contacts" on public.contacts;
create policy "read own contacts" on public.contacts
  for select to authenticated using (public.is_admin() or lower(email) = public.current_email());
drop policy if exists "admin manages contacts" on public.contacts;
create policy "admin manages contacts" on public.contacts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "read own contact messages" on public.contact_messages;
create policy "read own contact messages" on public.contact_messages
  for select to authenticated using (public.is_admin() or public.owns_contact(contact_id));
drop policy if exists "post contact messages" on public.contact_messages;
create policy "post contact messages" on public.contact_messages
  for insert to authenticated with check (
    (public.is_admin() and sender in ('admin', 'system'))
    or (public.owns_contact(contact_id) and sender = 'customer')
  );

-- Opening a conversation marks the other side's messages as read
create or replace function public.mark_contact_read(p_contact uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then
    update public.contact_messages set read_at = now() where contact_id = p_contact and sender = 'customer' and read_at is null;
  elsif public.owns_contact(p_contact) then
    update public.contact_messages set read_at = now() where contact_id = p_contact and sender in ('admin', 'system') and read_at is null;
  end if;
end $$;

-- "Make it a quote": turns a contact message into a custom planner request with the same conversation start
create or replace function public.contact_to_quote(p_contact uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  c public.contacts;
  q uuid;
  first_msg text;
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  select * into c from public.contacts where id = p_contact;
  if c.id is null then raise exception 'Message not found'; end if;
  if c.quote_id is not null then return c.quote_id; end if;

  select string_agg(body, E'\n\n' order by created_at) into first_msg
  from public.contact_messages where contact_id = p_contact and sender = 'customer';

  insert into public.quotes (email, name, license, request)
  values (lower(c.email), c.name, 'personal', jsonb_build_object('idea', coalesce(first_msg, ''), 'from', 'contact'))
  returning id into q;
  insert into public.quote_messages (quote_id, sender, kind, body, read_at)
  values (q, 'customer', 'request', coalesce(first_msg, ''), now());

  update public.contacts set quote_id = q, status = 'closed', updated_at = now() where id = p_contact;
  insert into public.contact_messages (contact_id, sender, body, read_at)
  values (p_contact, 'system', 'Moved to a custom planner request.', null);
  return q;
end $$;

revoke execute on function public.mark_contact_read(uuid) from anon;
revoke execute on function public.contact_to_quote(uuid) from anon;

do $$
begin
  alter publication supabase_realtime add table public.contacts;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.contact_messages;
exception when duplicate_object then null;
end $$;
