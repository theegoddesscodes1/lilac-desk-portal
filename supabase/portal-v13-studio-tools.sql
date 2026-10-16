-- Lilac Desk portal: studio tools
--   * your settings (saved replies, quote templates, reminders, morning summary, review requests)
--   * a log so each reminder or review request is only sent once
--   * notes customers pin on a proof
--   * the hourly job that runs reminders, the morning summary and review requests
-- Run once in Supabase: SQL Editor > New query > paste > Run.

-- ---------- your settings (one row) ----------
create table if not exists public.studio_settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.studio_settings (id) values (1) on conflict (id) do nothing;

alter table public.studio_settings enable row level security;
drop policy if exists "admin only" on public.studio_settings;
create policy "admin only" on public.studio_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- what the daily job already sent ----------
create table if not exists public.reminder_log (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders on delete cascade,
  kind text not null,              -- brief_nudge, proof_nudge_<round>, last_call, review, digest_<date>
  sent_at timestamptz not null default now()
);
create unique index if not exists reminder_log_once on public.reminder_log (kind, order_id) where order_id is not null;
create unique index if not exists reminder_log_once_global on public.reminder_log (kind) where order_id is null;

alter table public.reminder_log enable row level security;
drop policy if exists "admin reads" on public.reminder_log;
create policy "admin reads" on public.reminder_log
  for select to authenticated using (public.is_admin());

-- ---------- notes pinned on a proof ----------
create table if not exists public.proof_pins (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders on delete cascade,
  file_id uuid not null references public.files on delete cascade,
  round int not null default 1,
  page int not null default 1,
  x numeric not null check (x >= 0 and x <= 1),
  y numeric not null check (y >= 0 and y <= 1),
  body text not null check (length(trim(body)) > 0),
  sent_at timestamptz,             -- set when the pin goes out with a change request
  created_at timestamptz not null default now()
);
create index if not exists proof_pins_order_idx on public.proof_pins (order_id);

alter table public.proof_pins enable row level security;
drop policy if exists "read pins" on public.proof_pins;
create policy "read pins" on public.proof_pins
  for select to authenticated using (public.is_admin() or public.owns_order(order_id));
drop policy if exists "customer adds pins" on public.proof_pins;
create policy "customer adds pins" on public.proof_pins
  for insert to authenticated with check (public.owns_order(order_id) and sent_at is null);
drop policy if exists "customer edits unsent pins" on public.proof_pins;
create policy "customer edits unsent pins" on public.proof_pins
  for update to authenticated using (public.owns_order(order_id) and sent_at is null) with check (public.owns_order(order_id));
drop policy if exists "customer removes unsent pins" on public.proof_pins;
create policy "customer removes unsent pins" on public.proof_pins
  for delete to authenticated using (public.is_admin() or (public.owns_order(order_id) and sent_at is null));

do $$
begin
  alter publication supabase_realtime add table public.proof_pins;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.studio_settings;
exception when duplicate_object then null;
end $$;

-- ---------- the hourly job ----------
-- Calls the portal-daily function every hour at :07. The function decides what (if anything) is due,
-- and never sends the same reminder twice, so extra runs are harmless.
create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'lilac-daily';
select cron.schedule(
  'lilac-daily',
  '7 * * * *',
  $$select net.http_post(
      url := 'https://fdxbqdhzzyyggdtbjwnz.supabase.co/functions/v1/portal-daily',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{"source": "cron"}'::jsonb
  );$$
);
