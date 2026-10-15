-- Lilac Desk order portal: keep-alive
-- Run once in Supabase: SQL Editor > New query > paste > Run.
-- Gives the GitHub keep-alive job a tiny real database query to call,
-- so the free plan never counts the project as inactive.

create or replace function public.keepalive()
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.addons;
$$;

revoke execute on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;
