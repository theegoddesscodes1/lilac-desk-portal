-- Lilac Desk portal: a quote you send from an order chat shows up in that chat as the quote card.
-- Run once in Supabase: SQL Editor > New query > paste > Run.

alter table public.messages add column if not exists quote_id uuid references public.quotes on delete set null;

alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('message', 'revision_request', 'approval', 'quote'));
