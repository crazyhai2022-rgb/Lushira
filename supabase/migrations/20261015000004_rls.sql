-- Row Level Security for every table
create or replace function private.owns_salon(sid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.salons where id = sid and owner_id = (select auth.uid()));
$$;
create or replace function private.is_assigned_provider(sid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select sid is not null and exists (select 1 from public.salon_staff where id = sid and user_id = (select auth.uid()));
$$;
create or replace function private.service_salon(svc uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select salon_id from public.salon_services where id = svc;
$$;
grant execute on function private.owns_salon(uuid), private.is_assigned_provider(uuid), private.service_salon(uuid) to authenticated, service_role;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','user_roles','app_settings','audit_logs','service_categories','services','brands','salons','salon_private',
    'salon_images','salon_business_hours','salon_staff','salon_service_areas','salon_services','service_images','brand_services',
    'salon_brand_services','provider_availability','banners','coupons','bookings','booking_items','booking_status_history',
    'provider_locations','payments','webhook_events','refunds','reviews','favorites','customer_addresses','notifications',
    'support_tickets','partner_applications','otp_requests'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ===== profiles =====
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.is_admin());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke update on public.profiles from authenticated, anon;
grant update (full_name, email, avatar_url, marketing_opt_in, location_consent, deletion_requested_at) on public.profiles to authenticated;
revoke insert, delete on public.profiles from authenticated, anon;

-- ===== roles (read-only for clients) =====
create policy roles_select on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or private.is_admin());
revoke insert, update, delete on public.user_roles from authenticated, anon;

-- ===== settings / audit =====
create policy settings_read on public.app_settings for select to anon, authenticated using (true);
create policy settings_admin_write on public.app_settings for all to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy audit_admin_read on public.audit_logs for select to authenticated using (private.is_admin());
revoke insert, update, delete on public.audit_logs from authenticated, anon;

-- ===== public catalogue (admin-managed) =====
create policy categories_read on public.service_categories for select to anon, authenticated using (is_active or private.is_admin());
create policy categories_admin on public.service_categories for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy services_read on public.services for select to anon, authenticated using (is_active or private.is_admin());
create policy services_admin on public.services for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy brands_read on public.brands for select to anon, authenticated using (is_active or private.is_admin());
create policy brands_admin on public.brands for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy brand_services_read on public.brand_services for select to anon, authenticated using (is_active or private.is_admin());
create policy brand_services_admin on public.brand_services for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy banners_read on public.banners for select to anon, authenticated
  using ((is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now())) or private.is_admin());
create policy banners_admin on public.banners for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy coupons_admin on public.coupons for all to authenticated using (private.is_admin()) with check (private.is_admin());

-- ===== salons =====
create policy salons_public_read on public.salons for select to anon, authenticated using (status = 'approved');
create policy salons_owner_read on public.salons for select to authenticated
  using (owner_id = (select auth.uid()) or private.is_admin());
create policy salons_owner_insert on public.salons for insert to authenticated
  with check (owner_id = (select auth.uid()) and private.has_role('partner'));
create policy salons_owner_update on public.salons for update to authenticated
  using (owner_id = (select auth.uid()) or private.is_admin())
  with check (owner_id = (select auth.uid()) or private.is_admin());
create policy salons_admin_delete on public.salons for delete to authenticated using (private.is_admin());

create policy salon_private_owner on public.salon_private for all to authenticated
  using (private.owns_salon(salon_id) or private.is_admin())
  with check (private.owns_salon(salon_id) or private.is_admin());

-- ===== salon child tables: public read for approved salons, owner/admin manage =====
create policy salon_images_read on public.salon_images for select to anon, authenticated
  using (exists (select 1 from public.salons s where s.id = salon_id and s.status = 'approved'));
create policy salon_images_manage on public.salon_images for all to authenticated
  using (private.owns_salon(salon_id) or private.is_admin()) with check (private.owns_salon(salon_id) or private.is_admin());

create policy salon_hours_read on public.salon_business_hours for select to anon, authenticated
  using (exists (select 1 from public.salons s where s.id = salon_id and s.status = 'approved'));
create policy salon_hours_manage on public.salon_business_hours for all to authenticated
  using (private.owns_salon(salon_id) or private.is_admin()) with check (private.owns_salon(salon_id) or private.is_admin());

create policy salon_staff_read on public.salon_staff for select to anon, authenticated
  using (is_active and exists (select 1 from public.salons s where s.id = salon_id and s.status = 'approved'));
create policy salon_staff_own on public.salon_staff for select to authenticated using (user_id = (select auth.uid()));
create policy salon_staff_manage on public.salon_staff for all to authenticated
  using (private.owns_salon(salon_id) or private.is_admin()) with check (private.owns_salon(salon_id) or private.is_admin());

create policy salon_areas_read on public.salon_service_areas for select to anon, authenticated
  using (is_active and exists (select 1 from public.salons s where s.id = salon_id and s.status = 'approved'));
create policy salon_areas_manage on public.salon_service_areas for all to authenticated
  using (private.owns_salon(salon_id) or private.is_admin()) with check (private.owns_salon(salon_id) or private.is_admin());

create policy salon_services_read on public.salon_services for select to anon, authenticated
  using (is_active and exists (select 1 from public.salons s where s.id = salon_id and s.status = 'approved'));
create policy salon_services_owner_read on public.salon_services for select to authenticated
  using (private.owns_salon(salon_id) or private.is_admin());
create policy salon_services_manage on public.salon_services for all to authenticated
  using (private.owns_salon(salon_id) or private.is_admin()) with check (private.owns_salon(salon_id) or private.is_admin());

create policy service_images_read on public.service_images for select to anon, authenticated
  using (exists (select 1 from public.salon_services ss join public.salons s on s.id = ss.salon_id
                 where ss.id = salon_service_id and ss.is_active and s.status = 'approved'));
create policy service_images_manage on public.service_images for all to authenticated
  using (private.owns_salon(private.service_salon(salon_service_id)) or private.is_admin())
  with check (private.owns_salon(private.service_salon(salon_service_id)) or private.is_admin());

-- brand affiliation is public only after an admin has verified it
create policy salon_brand_read on public.salon_brand_services for select to anon, authenticated
  using (verified and exists (select 1 from public.salons s where s.id = salon_id and s.status = 'approved'));
create policy salon_brand_owner_read on public.salon_brand_services for select to authenticated
  using (private.owns_salon(salon_id) or private.is_admin());
create policy salon_brand_owner_insert on public.salon_brand_services for insert to authenticated
  with check ((private.owns_salon(salon_id) and verified = false) or private.is_admin());
create policy salon_brand_owner_delete on public.salon_brand_services for delete to authenticated
  using (private.owns_salon(salon_id) or private.is_admin());
create policy salon_brand_admin_update on public.salon_brand_services for update to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy availability_read on public.provider_availability for select to anon, authenticated
  using (exists (select 1 from public.salons s where s.id = salon_id and s.status = 'approved'));
create policy availability_manage on public.provider_availability for all to authenticated
  using (private.owns_salon(salon_id) or private.is_admin()) with check (private.owns_salon(salon_id) or private.is_admin());

-- ===== bookings (created only through create_booking RPC) =====
create policy bookings_customer_read on public.bookings for select to authenticated using (customer_id = (select auth.uid()));
create policy bookings_partner_read on public.bookings for select to authenticated
  using (private.owns_salon(salon_id) or private.is_assigned_provider(staff_id) or private.is_admin());
create policy bookings_partner_update on public.bookings for update to authenticated
  using (private.owns_salon(salon_id) or private.is_assigned_provider(staff_id) or private.is_admin())
  with check (private.owns_salon(salon_id) or private.is_assigned_provider(staff_id) or private.is_admin());
revoke insert, delete on public.bookings from authenticated, anon;

create policy booking_items_read on public.booking_items for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id));
create policy booking_history_read on public.booking_status_history for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id));
revoke insert, update, delete on public.booking_items, public.booking_status_history from authenticated, anon;

-- ===== live provider location =====
create policy loc_customer_read on public.provider_locations for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id and b.customer_id = (select auth.uid())
                 and b.mode = 'home' and b.status in ('provider_assigned','on_the_way','in_progress')));
create policy loc_provider_read on public.provider_locations for select to authenticated
  using (provider_id = (select auth.uid()) or private.is_admin());
create policy loc_provider_insert on public.provider_locations for insert to authenticated
  with check (provider_id = (select auth.uid()) and exists (
    select 1 from public.bookings b where b.id = booking_id and b.mode = 'home'
      and b.status in ('confirmed','provider_assigned','on_the_way')
      and (private.owns_salon(b.salon_id) or private.is_assigned_provider(b.staff_id))));
create policy loc_provider_update on public.provider_locations for update to authenticated
  using (provider_id = (select auth.uid()))
  with check (provider_id = (select auth.uid()) and exists (
    select 1 from public.bookings b where b.id = booking_id and b.status in ('provider_assigned','on_the_way')));
create policy loc_provider_delete on public.provider_locations for delete to authenticated using (provider_id = (select auth.uid()));

-- ===== payments / refunds (read-only for clients; written by trusted code) =====
create policy payments_read on public.payments for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id)); -- inherits booking visibility
revoke insert, update, delete on public.payments from authenticated, anon;
create policy refunds_read on public.refunds for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id));
create policy refunds_admin_update on public.refunds for update to authenticated
  using (private.is_admin()) with check (private.is_admin());
revoke insert, delete on public.refunds from authenticated, anon;

-- ===== reviews =====
create policy reviews_public_read on public.reviews for select to anon, authenticated
  using (is_visible and exists (select 1 from public.salons s where s.id = salon_id and s.status = 'approved'));
create policy reviews_own_read on public.reviews for select to authenticated
  using (customer_id = (select auth.uid()) or private.owns_salon(salon_id) or private.is_admin());
create policy reviews_customer_insert on public.reviews for insert to authenticated
  with check (customer_id = (select auth.uid()) and exists (
    select 1 from public.bookings b where b.id = booking_id and b.customer_id = (select auth.uid())
      and b.status = 'completed' and b.salon_id = reviews.salon_id));
create policy reviews_customer_update on public.reviews for update to authenticated
  using (customer_id = (select auth.uid())) with check (customer_id = (select auth.uid()));
create policy reviews_admin on public.reviews for all to authenticated using (private.is_admin()) with check (private.is_admin());
revoke update on public.reviews from authenticated;
grant update (rating, comment) on public.reviews to authenticated;
-- moderation (is_visible / reported) happens through admin RPCs, not direct client updates

-- ===== customer-owned data =====
create policy favorites_own on public.favorites for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy addresses_own on public.customer_addresses for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_read on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_mark_read on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;
revoke insert, delete on public.notifications from authenticated, anon;

-- ===== support =====
create policy tickets_insert on public.support_tickets for insert to anon, authenticated
  with check (status = 'open' and admin_notes is null and (user_id is null or user_id = (select auth.uid())));
create policy tickets_read on public.support_tickets for select to authenticated
  using (user_id = (select auth.uid()) or private.is_admin());
create policy tickets_admin_update on public.support_tickets for update to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy partner_apps_read on public.partner_applications for select to authenticated
  using (user_id = (select auth.uid()) or private.is_admin());
create policy partner_apps_admin on public.partner_applications for update to authenticated
  using (private.is_admin()) with check (private.is_admin());
revoke insert, delete on public.partner_applications from authenticated, anon;

-- otp_requests, webhook_events: RLS on with no policies = service role only
revoke all on public.otp_requests, public.webhook_events from anon, authenticated;
