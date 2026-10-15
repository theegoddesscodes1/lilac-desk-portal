-- Lilac Desk portal: proof rounds
-- Run once in Supabase: SQL Editor > New query > paste > Run.

-- Files uploaded together as one proof share a round number
alter table public.files add column if not exists round int;

-- Approvals now say which proof was approved, like "Proof 2 approved."
create or replace function public.approve_proof(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  r int;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null or not public.owns_order(p_order) then raise exception 'Order not found'; end if;
  if o.stage <> 'proof_ready' then raise exception 'There is no proof waiting for approval'; end if;

  select max(round) into r from public.files where order_id = p_order and kind = 'proof';

  update public.orders set stage = 'approved' where id = p_order;

  insert into public.messages (order_id, sender, kind, body)
  values (p_order, 'customer', 'approval', case when r is null then 'Proof approved.' else 'Proof ' || r || ' approved.' end);
end $$;

revoke execute on function public.approve_proof(uuid) from anon;
