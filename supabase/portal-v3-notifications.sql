-- Lilac Desk portal: sync the notification bell across your devices
-- Run once in Supabase: SQL Editor > New query > paste > Run.

create table if not exists public.studio_state (
  id int primary key default 1 check (id = 1),
  notifications_seen_at timestamptz not null default now()
);

insert into public.studio_state (id) values (1) on conflict (id) do nothing;

alter table public.studio_state enable row level security;

drop policy if exists "admins read studio state" on public.studio_state;
create policy "admins read studio state" on public.studio_state
  for select to authenticated using (public.is_admin());

-- Marks everything up to now as seen, for every device
create or replace function public.mark_notifications_seen()
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  t timestamptz := now();
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;
  update public.studio_state set notifications_seen_at = t where id = 1;
  return t;
end $$;

grant execute on function public.mark_notifications_seen() to authenticated;

-- Live updates so the badge clears on your other devices right away
do $$
begin
  alter publication supabase_realtime add table public.studio_state;
exception when duplicate_object then null;
end $$;
