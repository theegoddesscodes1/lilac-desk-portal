-- Lilac Desk portal: customers can decline a quote (or withdraw a request), and you can see who closed it and why.
-- Run once in Supabase: SQL Editor > New query > paste > Run.

alter table public.quotes add column if not exists closed_by text check (closed_by in ('customer', 'admin'));
alter table public.quotes add column if not exists close_reason text;
alter table public.quotes add column if not exists closed_at timestamptz;
