-- Lilac Desk portal: mark add-ons done one at a time
-- Run once in Supabase: SQL Editor > New query > paste > Run.

alter table public.order_addons add column if not exists done_at timestamptz;
