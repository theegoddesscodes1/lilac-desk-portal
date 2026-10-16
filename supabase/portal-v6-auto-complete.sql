-- Lilac Desk portal: complete delivered orders automatically when the 14-day fix window ends
-- Run once in Supabase: SQL Editor > New query > paste > Run.

create extension if not exists pg_cron;

create or replace function public.auto_complete_orders()
returns void language plpgsql security definer set search_path = public as $$
declare
  o record;
begin
  for o in
    select id from public.orders
     where stage = 'delivered'
       and delivered_at is not null
       and delivered_at < now() - interval '14 days'
  loop
    update public.orders set stage = 'complete' where id = o.id;
    insert into public.messages (order_id, sender, body)
    values (o.id, 'system', 'Your order is complete. Your files stay available here to download any time.');
  end loop;
end $$;

revoke execute on function public.auto_complete_orders() from anon, authenticated;

-- Runs every day at 6:00 AM Eastern (10:00 UTC). Re-running this file replaces the schedule.
select cron.unschedule(jobid) from cron.job where jobname = 'lilac-auto-complete';
select cron.schedule('lilac-auto-complete', '0 10 * * *', $$select public.auto_complete_orders();$$);
