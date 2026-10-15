-- Lilac Desk order portal: version 2 upgrade
-- Run once in Supabase: SQL Editor > New query > paste > Run.
-- Safe to run on the live database; it only adds things.
-- Adds: prices and refunds (for Income), read receipts (for unread badges),
-- customer profiles and settings, your private customer notes, and phone notifications.

-- ---------------------------------------------------------------
-- Prices and refunds
-- ---------------------------------------------------------------

alter table public.orders add column if not exists planner_price numeric(10,2);
alter table public.orders add column if not exists refunded_amount numeric(10,2) not null default 0;
alter table public.orders add column if not exists refunded_at timestamptz;
alter table public.order_addons add column if not exists price numeric(10,2);

-- ---------------------------------------------------------------
-- Read receipts
-- ---------------------------------------------------------------

alter table public.messages add column if not exists read_at timestamptz;

-- Marks the other side's messages on an order as read by the viewer
create or replace function public.mark_read(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then
    update public.messages set read_at = now()
     where order_id = p_order and sender = 'customer' and read_at is null;
  elsif public.owns_order(p_order) then
    update public.messages set read_at = now()
     where order_id = p_order and sender = 'admin' and read_at is null;
  end if;
end $$;

revoke execute on function public.mark_read(uuid) from anon;

-- ---------------------------------------------------------------
-- Customer profiles and settings
-- ---------------------------------------------------------------

create table if not exists public.customer_profiles (
  email text primary key,
  name text,
  phone text,
  alt_email text,
  notify_email boolean not null default true,
  notify_push boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.customer_profiles enable row level security;

drop policy if exists "read own profile" on public.customer_profiles;
create policy "read own profile" on public.customer_profiles
  for select to authenticated using (public.is_admin() or lower(email) = public.current_email());
drop policy if exists "create own profile" on public.customer_profiles;
create policy "create own profile" on public.customer_profiles
  for insert to authenticated with check (lower(email) = public.current_email());
drop policy if exists "update own profile" on public.customer_profiles;
create policy "update own profile" on public.customer_profiles
  for update to authenticated
  using (public.is_admin() or lower(email) = public.current_email())
  with check (public.is_admin() or lower(email) = public.current_email());

-- ---------------------------------------------------------------
-- Your private notes about customers (only you can see these)
-- ---------------------------------------------------------------

create table if not exists public.customer_notes (
  email text primary key,
  notes text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.customer_notes enable row level security;

drop policy if exists "admin manages notes" on public.customer_notes;
create policy "admin manages notes" on public.customer_notes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------
-- Phone notifications (one row per phone, tablet, or browser)
-- ---------------------------------------------------------------

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  is_admin boolean not null default false,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "read own devices" on public.push_subscriptions;
create policy "read own devices" on public.push_subscriptions
  for select to authenticated using (lower(email) = public.current_email());
drop policy if exists "add own device" on public.push_subscriptions;
create policy "add own device" on public.push_subscriptions
  for insert to authenticated
  with check (lower(email) = public.current_email() and is_admin = public.is_admin());
drop policy if exists "remove own device" on public.push_subscriptions;
create policy "remove own device" on public.push_subscriptions
  for delete to authenticated using (lower(email) = public.current_email());

-- ---------------------------------------------------------------
-- Live updates for the new tables
-- ---------------------------------------------------------------

do $$
begin
  begin
    alter publication supabase_realtime add table public.customer_profiles;
  exception when duplicate_object then null;
  end;
end $$;

-- Refund ids already counted, so a repeated Shopify webhook is never counted twice
alter table public.orders add column if not exists refund_ids bigint[] not null default '{}';
