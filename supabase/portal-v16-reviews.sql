-- Lilac Desk portal: reviews
--   * customers leave a star rating, a few words and an optional photo on a delivered order
--   * you choose which ones show on lilacdesk.com
--   * after reviewing, they see your thank-you code (set in Settings)
-- Run once in Supabase: SQL Editor > New query > paste > Run.

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders on delete cascade,
  email text not null,
  name text,
  rating int not null check (rating between 1 and 5),
  body text,
  photo_path text,
  ok_to_share boolean not null default true,   -- the customer agreed it can be shown on the shop
  featured boolean not null default false,     -- you chose to show it on the shop
  created_at timestamptz not null default now()
);

alter table public.reviews enable row level security;

drop policy if exists "read own reviews" on public.reviews;
create policy "read own reviews" on public.reviews
  for select to authenticated using (public.is_admin() or lower(email) = public.current_email());
drop policy if exists "customer reviews own delivered order" on public.reviews;
create policy "customer reviews own delivered order" on public.reviews
  for insert to authenticated with check (
    public.owns_order(order_id)
    and lower(email) = public.current_email()
    and featured = false
    and exists (select 1 from public.orders o where o.id = order_id and o.stage in ('delivered', 'complete'))
  );
drop policy if exists "admin manages reviews" on public.reviews;
create policy "admin manages reviews" on public.reviews
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

do $$
begin
  alter publication supabase_realtime add table public.reviews;
exception when duplicate_object then null;
end $$;

-- Photos: a public folder so featured photos can show on the shop. Customers can only add to their own folder.
insert into storage.buckets (id, name, public) values ('review-photos', 'review-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "customers add review photos" on storage.objects;
create policy "customers add review photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'review-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "admin manages review photos" on storage.objects;
create policy "admin manages review photos" on storage.objects
  for all to authenticated using (bucket_id = 'review-photos' and public.is_admin()) with check (bucket_id = 'review-photos' and public.is_admin());

-- The reviews you chose to show, for the reviews section on lilacdesk.com (first name and last initial only)
create or replace function public.featured_reviews()
returns table (name text, rating int, body text, photo_path text, planner text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select
    trim(split_part(coalesce(r.name, ''), ' ', 1) || ' ' || left(split_part(coalesce(r.name, ''), ' ', 2), 1) || case when split_part(coalesce(r.name, ''), ' ', 2) <> '' then '.' else '' end),
    r.rating, r.body, r.photo_path,
    initcap(o.tier) || ' ' || o.license || ' planner',
    r.created_at
  from public.reviews r join public.orders o on o.id = r.order_id
  where r.featured and r.ok_to_share
  order by r.created_at desc
  limit 24;
$$;
grant execute on function public.featured_reviews() to anon, authenticated;

-- Your thank-you code, shown only to customers who have left a review
create or replace function public.review_thanks()
returns jsonb language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.reviews where lower(email) = public.current_email())
    then jsonb_build_object(
      'code', (select data->'review'->>'thanksCode' from public.studio_settings where id = 1),
      'offer', (select data->'review'->>'thanksOffer' from public.studio_settings where id = 1)
    )
    else '{}'::jsonb
  end;
$$;
revoke execute on function public.review_thanks() from anon;
