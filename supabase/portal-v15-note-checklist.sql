-- Lilac Desk portal: check off a customer's pinned notes as you make each change.
-- "Done" or "Not changed" (with your reason) shows to the customer only once you send the next proof.
-- Run once in Supabase: SQL Editor > New query > paste > Run.

alter table public.proof_pins add column if not exists done_at timestamptz;
alter table public.proof_pins add column if not exists skipped_at timestamptz;
alter table public.proof_pins add column if not exists admin_note text;

drop policy if exists "admin updates pins" on public.proof_pins;
create policy "admin updates pins" on public.proof_pins
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
