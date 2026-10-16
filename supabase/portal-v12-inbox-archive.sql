-- Lilac Desk portal: archive conversations in Messages. Only you (admin) can see or change this.
-- Finished conversations also archive on their own (orders past the fix window, paid or closed quotes,
-- finished contact messages). A new message from the customer brings a conversation back.
-- Run once in Supabase: SQL Editor > New query > paste > Run.

create table if not exists public.inbox_archive (
  thread_key text primary key,          -- 'cust:<email>', 'quote:<id>' or 'contact:<id>'
  state text not null check (state in ('archived', 'open')),
  set_at timestamptz not null default now()
);

alter table public.inbox_archive enable row level security;
drop policy if exists "admin only" on public.inbox_archive;
create policy "admin only" on public.inbox_archive
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

do $$
begin
  alter publication supabase_realtime add table public.inbox_archive;
exception when duplicate_object then null;
end $$;
