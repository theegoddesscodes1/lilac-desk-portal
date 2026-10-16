-- Lilac Desk portal: your own to-do tags and notes on each order. Only you (admin) can see or change them.
-- Run once in Supabase: SQL Editor > New query > paste > Run.

create table if not exists public.order_tags (
  order_id uuid primary key references public.orders on delete cascade,
  tags text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists public.order_notes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists order_notes_order_idx on public.order_notes (order_id);

alter table public.order_tags enable row level security;
alter table public.order_notes enable row level security;

drop policy if exists "admin only" on public.order_tags;
create policy "admin only" on public.order_tags
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin only" on public.order_notes;
create policy "admin only" on public.order_notes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

do $$
begin
  alter publication supabase_realtime add table public.order_tags;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.order_notes;
exception when duplicate_object then null;
end $$;
