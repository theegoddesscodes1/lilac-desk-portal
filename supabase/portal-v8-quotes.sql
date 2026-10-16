-- Lilac Desk portal: custom planner quotes, requested and agreed inside the portal
-- Run once in Supabase: SQL Editor > New query > paste > Run.

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text,
  status text not null default 'open' check (status in ('open', 'quoted', 'paid', 'closed')),
  license text check (license in ('personal', 'commercial')),
  request jsonb not null default '{}'::jsonb,
  price numeric,
  scope text,
  invoice_url text,
  draft_order_id text,
  order_id uuid references public.orders on delete set null,
  quoted_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists quotes_email_idx on public.quotes (lower(email));

create table if not exists public.quote_messages (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes on delete cascade,
  sender text not null check (sender in ('customer', 'admin', 'system')),
  kind text not null default 'message' check (kind in ('message', 'request', 'quote', 'paid')),
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists quote_messages_quote_idx on public.quote_messages (quote_id);

alter table public.quotes enable row level security;
alter table public.quote_messages enable row level security;

create or replace function public.owns_quote(p_quote uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.quotes where id = p_quote and lower(email) = public.current_email());
$$;

drop policy if exists "read own quotes" on public.quotes;
create policy "read own quotes" on public.quotes
  for select to authenticated using (public.is_admin() or lower(email) = public.current_email());
drop policy if exists "admin manages quotes" on public.quotes;
create policy "admin manages quotes" on public.quotes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "read own quote messages" on public.quote_messages;
create policy "read own quote messages" on public.quote_messages
  for select to authenticated using (public.is_admin() or public.owns_quote(quote_id));
drop policy if exists "post quote messages" on public.quote_messages;
create policy "post quote messages" on public.quote_messages
  for insert to authenticated with check (
    (public.is_admin() and sender in ('admin', 'system'))
    or (public.owns_quote(quote_id) and sender = 'customer' and kind = 'message')
  );

-- A signed-in visitor asks for a quote. The email always comes from their sign-in.
create or replace function public.request_quote(p_request jsonb, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  q uuid;
  lic text := case when p_request->>'license' = 'commercial' then 'commercial' else 'personal' end;
begin
  if public.current_email() = '' then raise exception 'Please sign in first'; end if;
  if coalesce(trim(p_request->>'idea'), '') = '' then raise exception 'Tell me a little about what you have in mind'; end if;

  insert into public.quotes (email, name, license, request)
  values (public.current_email(), nullif(trim(p_name), ''), lic, p_request)
  returning id into q;

  insert into public.quote_messages (quote_id, sender, kind, body)
  values (q, 'customer', 'request', p_request->>'idea');

  return q;
end $$;

-- Opening a quote chat marks the other side's messages as read
create or replace function public.mark_quote_read(p_quote uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then
    update public.quote_messages set read_at = now() where quote_id = p_quote and sender = 'customer' and read_at is null;
  elsif public.owns_quote(p_quote) then
    update public.quote_messages set read_at = now() where quote_id = p_quote and sender in ('admin', 'system') and read_at is null;
  end if;
end $$;

revoke execute on function public.request_quote(jsonb, text) from anon;
revoke execute on function public.mark_quote_read(uuid) from anon;

do $$
begin
  alter publication supabase_realtime add table public.quotes;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.quote_messages;
exception when duplicate_object then null;
end $$;
