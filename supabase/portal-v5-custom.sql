-- Lilac Desk portal: custom planners (quoted and invoiced from Shopify)
-- Run once in Supabase: SQL Editor > New query > paste > Run.

-- 1. Allow the "custom" tier
alter table public.orders drop constraint if exists orders_tier_check;
alter table public.orders add constraint orders_tier_check check (tier in ('basic', 'standard', 'premium', 'custom'));

-- 2. What you agreed with the customer (taken from the invoice note in Shopify)
alter table public.orders add column if not exists scope_note text;

-- 3. Custom orders have no fixed delivery time; you set the due date on the order page
create or replace function public.tier_days(t text)
returns int language sql immutable as $$
  select case t when 'basic' then 7 when 'standard' then 12 when 'premium' then 21 else null end;
$$;

create or replace function public.submit_brief(p_order uuid, p_brief jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  d int;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null or not public.owns_order(p_order) then raise exception 'Order not found'; end if;
  if o.brief_submitted_at is not null then raise exception 'This brief has already been submitted'; end if;

  d := public.tier_days(o.tier);
  if d is not null and exists (select 1 from public.order_addons where order_id = p_order and addon_key = 'rush') then
    d := ceil(d / 2.0);
  end if;

  update public.orders
     set brief = p_brief,
         brief_submitted_at = now(),
         stage = 'brief_received',
         -- custom orders keep a due date you already set, or wait for you to set one
         due_at = case when d is null then o.due_at else now() + make_interval(days => d) end,
         last_customer_activity_at = now()
   where id = p_order;

  insert into public.messages (order_id, sender, body)
  values (
    p_order,
    'system',
    case when d is null and o.due_at is null
      then 'Brief submitted. Kerry will confirm your delivery date shortly.'
      else 'Brief submitted. Your delivery countdown has started.'
    end
  );
end $$;

revoke execute on function public.submit_brief(uuid, jsonb) from anon;
