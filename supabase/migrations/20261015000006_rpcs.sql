-- RPCs: geo search, slots, booking, cancellation, coupons, cash, salon review workflow

-- ---------- guard update: allow trusted RPCs (bypass flag) + block confirm before online payment ----------
create or replace function public.bookings_guard()
returns trigger language plpgsql set search_path = '' as $$
declare is_priv boolean;
begin
  is_priv := coalesce((select auth.role()), '') = 'service_role'
          or private.is_admin()
          or coalesce(current_setting('lushira.bypass_guard', true), '') = 'on';
  if tg_op = 'UPDATE' and not is_priv then
    new.customer_id := old.customer_id; new.salon_id := old.salon_id; new.resource_key := old.resource_key;
    new.scheduled_start := old.scheduled_start; new.scheduled_end := old.scheduled_end; new.blocked_until := old.blocked_until;
    new.subtotal_inr := old.subtotal_inr; new.discount_inr := old.discount_inr; new.tax_inr := old.tax_inr;
    new.fee_inr := old.fee_inr; new.total_inr := old.total_inr; new.coupon_id := old.coupon_id;
    new.payment_method := old.payment_method; new.reference := old.reference; new.mode := old.mode;
    new.customer_name := old.customer_name; new.customer_phone := old.customer_phone; new.address := old.address;
    new.payment_status := old.payment_status;   -- payment state only changes via trusted functions
    if new.status is distinct from old.status then
      if not (
        (old.status = 'pending' and new.status in ('confirmed','rejected')) or
        (old.status = 'confirmed' and new.status in ('provider_assigned','on_the_way','in_progress','cancelled','no_show')) or
        (old.status = 'provider_assigned' and new.status in ('on_the_way','in_progress','cancelled','no_show')) or
        (old.status = 'on_the_way' and new.status in ('in_progress','cancelled','no_show')) or
        (old.status = 'in_progress' and new.status = 'completed')
      ) then
        new.status := old.status;
      end if;
      if new.status = 'on_the_way' and old.mode <> 'home' then new.status := old.status; end if;
      if new.status = 'confirmed' and old.payment_method = 'razorpay' and old.payment_status <> 'paid' then
        new.status := old.status;   -- never confirm an unpaid online booking
      end if;
    end if;
  end if;
  if new.status = 'cancelled' and new.cancelled_at is null then new.cancelled_at := now(); end if;
  return new;
end $$;

-- ---------- geo search (runs as the caller, so RLS only exposes approved salons) ----------
create or replace function public.nearby_salons(
  p_lat double precision, p_lng double precision,
  p_radius_km numeric default null, p_category_slug text default null,
  p_query text default null, p_home_only boolean default false, p_limit int default 50)
returns table (
  id uuid, name text, slug text, logo_url text, cover_url text, area text, city text, address_line text,
  rating_avg numeric, rating_count int, home_service boolean, featured boolean,
  min_price numeric, distance_m double precision, lat double precision, lng double precision)
language plpgsql stable set search_path = public, extensions as $$
declare r numeric; origin geography; q text;
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid_coordinates' using errcode = '22023';
  end if;
  r := coalesce(p_radius_km, (select (a.value #>> '{}')::numeric from app_settings a where a.key = 'search_radius_km'), 5);
  r := least(greatest(r, 0.5), 50);
  origin := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
  q := nullif(replace(replace(coalesce(trim(p_query), ''), '%', ''), '_', ''), '');
  return query
  select s.id, s.name, s.slug, s.logo_url, s.cover_url, s.area, s.city, s.address_line,
         s.rating_avg, s.rating_count, s.home_service, s.featured,
         (select min(ss.price_inr) from salon_services ss where ss.salon_id = s.id and ss.is_active),
         st_distance(s.location, origin),
         st_y(s.location::geometry), st_x(s.location::geometry)
  from salons s
  where s.status = 'approved' and s.location is not null
    and st_dwithin(s.location, origin, r * 1000)
    and (not p_home_only or s.home_service)
    and (q is null or s.name ilike '%' || q || '%'
         or exists (select 1 from salon_services x where x.salon_id = s.id and x.is_active and x.name ilike '%' || q || '%'))
    and (p_category_slug is null or exists (
         select 1 from salon_services x join service_categories c on c.id = x.category_id
         where x.salon_id = s.id and x.is_active and c.slug = p_category_slug))
  order by st_distance(s.location, origin) asc
  limit least(greatest(p_limit, 1), 100);
end $$;

create or replace function public.search_services(
  p_query text default null, p_category_slug text default null,
  p_lat double precision default null, p_lng double precision default null,
  p_radius_km numeric default null, p_max_price numeric default null, p_mode text default null,
  p_min_rating numeric default null, p_sort text default 'relevance', p_limit int default 60)
returns table (
  id uuid, name text, description text, price_inr numeric, duration_min int, image_url text,
  at_salon boolean, at_home boolean, is_wedding boolean, category_slug text, category_name text,
  salon_id uuid, salon_name text, salon_slug text, salon_logo text, rating_avg numeric, rating_count int,
  distance_m double precision)
language plpgsql stable set search_path = public, extensions as $$
declare origin geography; q text; r numeric;
begin
  q := nullif(replace(replace(coalesce(trim(p_query), ''), '%', ''), '_', ''), '');
  if p_lat is not null and p_lng is not null then
    if p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'invalid_coordinates' using errcode = '22023'; end if;
    origin := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
    r := least(greatest(coalesce(p_radius_km, (select (a.value #>> '{}')::numeric from app_settings a where a.key = 'search_radius_km'), 5), 0.5), 50);
  end if;
  return query
  select ss.id, ss.name, ss.description, ss.price_inr, ss.duration_min, ss.image_url, ss.at_salon, ss.at_home, ss.is_wedding,
         c.slug, c.name, s.id, s.name, s.slug, s.logo_url, s.rating_avg, s.rating_count,
         case when origin is null or s.location is null then null else st_distance(s.location, origin) end
  from salon_services ss
  join salons s on s.id = ss.salon_id and s.status = 'approved'
  left join service_categories c on c.id = ss.category_id
  where ss.is_active
    and (q is null or ss.name ilike '%' || q || '%' or s.name ilike '%' || q || '%' or c.name ilike '%' || q || '%')
    and (p_category_slug is null or c.slug = p_category_slug)
    and (p_max_price is null or ss.price_inr <= p_max_price)
    and (p_min_rating is null or s.rating_avg >= p_min_rating)
    and (p_mode is null or (p_mode = 'home' and ss.at_home) or (p_mode = 'salon' and ss.at_salon))
    and (origin is null or (s.location is not null and st_dwithin(s.location, origin, r * 1000)))
  order by
    case when p_sort = 'price_asc' then ss.price_inr end asc,
    case when p_sort = 'price_desc' then ss.price_inr end desc,
    case when p_sort = 'rating' then s.rating_avg end desc,
    case when p_sort = 'distance' and origin is not null then st_distance(s.location, origin) end asc,
    s.featured desc, s.rating_avg desc, ss.name asc
  limit least(greatest(p_limit, 1), 200);
end $$;

-- ---------- availability (30-minute grid, IST) ----------
create or replace function public.get_available_slots(
  p_salon_id uuid, p_date date, p_duration_min int, p_staff_id uuid default null, p_buffer_min int default 0)
returns table (slot_start timestamptz, slot_end timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
declare h record; cap int; tz constant text := 'Asia/Kolkata'; wd int; buf interval;
begin
  if p_duration_min is null or p_duration_min < 5 or p_duration_min > 720 then raise exception 'invalid_duration'; end if;
  buf := make_interval(mins => greatest(0, least(coalesce(p_buffer_min, 0), 120)));
  select s.concurrent_capacity into cap from salons s where s.id = p_salon_id and s.status = 'approved';
  if cap is null then return; end if;
  wd := extract(dow from p_date)::int;
  select * into h from salon_business_hours bh where bh.salon_id = p_salon_id and bh.weekday = wd;
  if not found or h.is_closed then return; end if;
  if exists (select 1 from provider_availability a
             where a.salon_id = p_salon_id and a.on_date = p_date and a.is_blocked and a.start_time is null
               and (a.staff_id is null or a.staff_id = p_staff_id)) then
    return;
  end if;
  return query
  with cand as (
    select gs as s, gs + make_interval(mins => p_duration_min) as e
    from generate_series(
      ((p_date + h.opens) at time zone tz),
      ((p_date + h.closes) at time zone tz) - make_interval(mins => p_duration_min),
      interval '30 minutes') gs
  )
  select c.s, c.e from cand c
  where c.s > now() + interval '60 minutes'
    and not exists (
      select 1 from provider_availability a
      where a.salon_id = p_salon_id and a.on_date = p_date and a.is_blocked
        and a.start_time is not null and a.end_time is not null
        and (a.staff_id is null or a.staff_id = p_staff_id)
        and tstzrange((p_date + a.start_time) at time zone tz, (p_date + a.end_time) at time zone tz) && tstzrange(c.s, c.e))
    and (select count(*) from bookings b
         where b.salon_id = p_salon_id
           and b.status in ('pending','confirmed','provider_assigned','on_the_way','in_progress')
           and (p_staff_id is null or b.staff_id = p_staff_id)
           and tstzrange(b.scheduled_start, b.blocked_until) && tstzrange(c.s, c.e + buf))
        < case when p_staff_id is null then cap else 1 end
  order by c.s;
end $$;

-- ---------- coupons ----------
create or replace function private.apply_coupon(p_code text, p_salon uuid, p_subtotal numeric, p_user uuid)
returns table (coupon_id uuid, discount numeric)
language plpgsql security definer set search_path = public, extensions as $$
declare c record; d numeric; used int;
begin
  select * into c from coupons cp where cp.code = p_code::extensions.citext and cp.is_active;
  if not found then raise exception 'coupon_invalid'; end if;
  if c.starts_at is not null and c.starts_at > now() then raise exception 'coupon_not_started'; end if;
  if c.expires_at is not null and c.expires_at < now() then raise exception 'coupon_expired'; end if;
  if c.usage_limit is not null and c.used_count >= c.usage_limit then raise exception 'coupon_exhausted'; end if;
  if c.salon_id is not null and c.salon_id <> p_salon then raise exception 'coupon_not_applicable'; end if;
  if p_subtotal < c.min_order_inr then raise exception 'coupon_min_order'; end if;
  select count(*) into used from bookings b where b.customer_id = p_user and b.coupon_id = c.id and b.status not in ('cancelled','rejected');
  if used >= c.per_user_limit then raise exception 'coupon_already_used'; end if;
  if c.discount_type = 'percent' then d := round(p_subtotal * c.value / 100, 2); else d := c.value; end if;
  if c.max_discount_inr is not null then d := least(d, c.max_discount_inr); end if;
  d := least(d, p_subtotal);
  return query select c.id, d;
end $$;

create or replace function public.validate_coupon(p_code text, p_salon_id uuid, p_subtotal numeric)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r record;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated'; end if;
  select a.coupon_id, a.discount into r from private.apply_coupon(trim(p_code), p_salon_id, p_subtotal, (select auth.uid())) a;
  return jsonb_build_object('valid', true, 'discount_inr', r.discount);
exception when others then
  if sqlerrm like 'coupon\_%' then return jsonb_build_object('valid', false, 'reason', sqlerrm); end if;
  raise;
end $$;

-- ---------- booking creation: all prices, slots and totals are computed server-side ----------
create or replace function public.create_booking(
  p_salon_id uuid, p_items jsonb, p_start timestamptz, p_mode public.service_mode, p_staff_id uuid,
  p_customer_name text, p_customer_phone text, p_customer_email text, p_notes text,
  p_address jsonb, p_address_lat double precision, p_address_lng double precision,
  p_payment_method public.payment_method, p_coupon_code text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid := (select auth.uid());
  s record; it record; b public.bookings;
  v_subtotal numeric := 0; v_duration int := 0; v_buffer int := 0; v_discount numeric := 0; v_coupon uuid;
  v_tax_pct numeric; v_fee numeric; v_tax numeric; v_total numeric;
  v_end timestamptz; v_blocked timestamptz; v_phone text; v_name text; v_keys text[]; v_key text; n_items int := 0;
  v_addr_loc geography; v_pay_status public.payment_status;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into s from salons sl where sl.id = p_salon_id and sl.status = 'approved';
  if not found then raise exception 'salon_unavailable'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 10 then
    raise exception 'invalid_items';
  end if;
  v_phone := regexp_replace(coalesce(p_customer_phone, ''), '[^0-9+]', '', 'g');
  if v_phone !~ '^\+?[0-9]{10,15}$' then raise exception 'invalid_phone'; end if;
  v_name := left(trim(coalesce(p_customer_name, '')), 120);
  if char_length(v_name) < 2 then raise exception 'invalid_name'; end if;
  if p_start is null then raise exception 'invalid_start'; end if;

  if p_mode = 'home' then
    if not s.home_service then raise exception 'home_not_supported'; end if;
    if p_address is null or p_address_lat is null or p_address_lng is null
       or p_address_lat not between -90 and 90 or p_address_lng not between -180 and 180 then
      raise exception 'address_required';
    end if;
    v_addr_loc := st_setsrid(st_makepoint(p_address_lng, p_address_lat), 4326)::geography;
  end if;
  if p_staff_id is not null and not exists (
      select 1 from salon_staff st where st.id = p_staff_id and st.salon_id = p_salon_id and st.is_active) then
    raise exception 'invalid_staff';
  end if;

  for it in
    select ss.id, ss.name, ss.price_inr, ss.duration_min, ss.buffer_min, ss.at_salon, ss.at_home,
           greatest(1, least(10, coalesce((e ->> 'quantity')::int, 1))) as qty
    from jsonb_array_elements(p_items) e
    join salon_services ss on ss.id = (e ->> 'salon_service_id')::uuid and ss.salon_id = p_salon_id and ss.is_active
  loop
    if p_mode = 'home' and not it.at_home then raise exception 'service_not_available_at_home'; end if;
    if p_mode = 'salon' and not it.at_salon then raise exception 'service_not_available_at_salon'; end if;
    v_subtotal := v_subtotal + it.price_inr * it.qty;
    v_duration := v_duration + it.duration_min * it.qty;
    v_buffer := greatest(v_buffer, it.buffer_min);
    n_items := n_items + 1;
  end loop;
  if n_items <> jsonb_array_length(p_items) then raise exception 'invalid_items'; end if;
  if v_duration > 720 then raise exception 'duration_too_long'; end if;

  if not exists (
      select 1 from get_available_slots(p_salon_id, (p_start at time zone 'Asia/Kolkata')::date, v_duration, p_staff_id, v_buffer) g
      where g.slot_start = p_start) then
    raise exception 'slot_unavailable';
  end if;

  if p_payment_method = 'cash' and not coalesce((select (a.value #>> '{}')::boolean from app_settings a where a.key = 'cash_payments_enabled'), true) then
    raise exception 'cash_disabled';
  end if;
  if p_payment_method = 'razorpay' and not coalesce((select (a.value #>> '{}')::boolean from app_settings a where a.key = 'online_payments_enabled'), true) then
    raise exception 'online_disabled';
  end if;

  if nullif(trim(coalesce(p_coupon_code, '')), '') is not null then
    select a.coupon_id, a.discount into v_coupon, v_discount
    from private.apply_coupon(trim(p_coupon_code), p_salon_id, v_subtotal, uid) a;
  end if;
  v_tax_pct := coalesce((select (a.value #>> '{}')::numeric from app_settings a where a.key = 'tax_percent'), 0);
  v_fee := coalesce((select (a.value #>> '{}')::numeric from app_settings a where a.key = 'platform_fee_inr'), 0);
  v_tax := round((v_subtotal - v_discount) * v_tax_pct / 100, 2);
  v_total := v_subtotal - v_discount + v_tax + v_fee;

  v_end := p_start + make_interval(mins => v_duration);
  v_blocked := v_end + make_interval(mins => v_buffer);
  v_pay_status := (case when p_payment_method = 'cash' then 'cash_due' else 'unpaid' end)::public.payment_status;

  if p_staff_id is not null then
    v_keys := array[p_staff_id::text];
  else
    select array_agg('lane-' || g) into v_keys from generate_series(0, s.concurrent_capacity - 1) g;
  end if;

  foreach v_key in array v_keys loop
    begin
      insert into bookings (customer_id, salon_id, staff_id, resource_key, mode, scheduled_start, scheduled_end, blocked_until,
        customer_name, customer_phone, customer_email, notes, address, address_location,
        subtotal_inr, discount_inr, tax_inr, fee_inr, total_inr, coupon_id, payment_method, payment_status)
      values (uid, p_salon_id, p_staff_id, v_key, p_mode, p_start, v_end, v_blocked,
        v_name, v_phone, nullif(left(trim(coalesce(p_customer_email, '')), 254), ''), left(p_notes, 500),
        case when p_mode = 'home' then p_address end, v_addr_loc,
        v_subtotal, v_discount, v_tax, v_fee, v_total, v_coupon, p_payment_method, v_pay_status)
      returning * into b;
      exit;
    exception when exclusion_violation then
      b := null;
    end;
  end loop;
  if b.id is null then raise exception 'slot_unavailable'; end if;

  insert into booking_items (booking_id, salon_service_id, name, price_inr, duration_min, quantity)
  select b.id, ss.id, ss.name, ss.price_inr, ss.duration_min,
         greatest(1, least(10, coalesce((e ->> 'quantity')::int, 1)))
  from jsonb_array_elements(p_items) e
  join salon_services ss on ss.id = (e ->> 'salon_service_id')::uuid and ss.salon_id = p_salon_id;

  insert into payments (booking_id, method, amount_inr, status)
  values (b.id, p_payment_method, v_total, (case when p_payment_method = 'cash' then 'cash_due' else 'pending' end)::public.payment_status);

  if v_coupon is not null then
    update coupons c set used_count = c.used_count + 1
    where c.id = v_coupon and (c.usage_limit is null or c.used_count < c.usage_limit);
    if not found then raise exception 'coupon_exhausted'; end if;
  end if;

  insert into notifications (user_id, title, body, kind, booking_id)
  values (s.owner_id, 'New booking request',
          b.customer_name || ' booked for ' || to_char(b.scheduled_start at time zone 'Asia/Kolkata', 'DD Mon, HH12:MI AM') || ' (' || b.reference || ')',
          'partner_booking', b.id);

  return jsonb_build_object('id', b.id, 'reference', b.reference, 'total_inr', b.total_inr,
                            'payment_method', b.payment_method, 'payment_status', b.payment_status, 'status', b.status);
end $$;

-- ---------- customer cancel / refund request ----------
create or replace function public.cancel_booking(p_booking_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := (select auth.uid()); b public.bookings; pay public.payments; win int; refund_ok boolean := false;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into b from bookings x where x.id = p_booking_id and x.customer_id = uid for update;
  if not found then raise exception 'not_found'; end if;
  if b.status not in ('pending','confirmed','provider_assigned') then raise exception 'cannot_cancel'; end if;
  win := coalesce((select (a.value #>> '{}')::int from app_settings a where a.key = 'cancellation_window_hours'), 4);
  perform set_config('lushira.bypass_guard', 'on', true);
  update bookings set status = 'cancelled', cancel_reason = left(p_reason, 300), cancelled_at = now() where id = b.id;
  if b.payment_status = 'paid' then
    refund_ok := now() <= b.scheduled_start - make_interval(hours => win);
    if refund_ok then
      select * into pay from payments p where p.booking_id = b.id and p.status = 'paid' order by p.created_at desc limit 1;
      if found then
        insert into refunds (payment_id, booking_id, amount_inr, reason, requested_by)
        values (pay.id, b.id, pay.amount_inr, 'Customer cancellation within free-cancellation window', uid);
        update bookings set payment_status = 'refund_pending' where id = b.id;
      end if;
    end if;
  end if;
  perform set_config('lushira.bypass_guard', 'off', true);
  insert into notifications (user_id, title, body, kind, booking_id)
  select s.owner_id, 'Booking cancelled', 'Booking ' || b.reference || ' was cancelled by the customer.', 'partner_booking', b.id
  from salons s where s.id = b.salon_id;
  return jsonb_build_object('status', 'cancelled', 'refund_requested', refund_ok);
end $$;

create or replace function public.request_refund(p_booking_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := (select auth.uid()); b public.bookings; pay public.payments;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into b from bookings x where x.id = p_booking_id and x.customer_id = uid;
  if not found then raise exception 'not_found'; end if;
  if b.payment_status <> 'paid' then raise exception 'nothing_to_refund'; end if;
  if exists (select 1 from refunds r where r.booking_id = b.id and r.status in ('requested','approved','processing','processed')) then
    raise exception 'refund_exists';
  end if;
  select * into pay from payments p where p.booking_id = b.id and p.status = 'paid' order by p.created_at desc limit 1;
  if not found then raise exception 'nothing_to_refund'; end if;
  insert into refunds (payment_id, booking_id, amount_inr, reason, requested_by)
  values (pay.id, b.id, pay.amount_inr, left(p_reason, 500), uid);
  perform set_config('lushira.bypass_guard', 'on', true);
  update bookings set payment_status = 'refund_pending' where id = b.id;
  perform set_config('lushira.bypass_guard', 'off', true);
end $$;

-- ---------- cash on service ----------
create or replace function public.mark_cash_collected(p_booking_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := (select auth.uid()); b public.bookings;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into b from bookings x where x.id = p_booking_id for update;
  if not found then raise exception 'not_found'; end if;
  if not (private.owns_salon(b.salon_id) or private.is_assigned_provider(b.staff_id) or private.is_admin()) then
    raise exception 'forbidden';
  end if;
  if b.payment_method <> 'cash' or b.payment_status <> 'cash_due' or b.status not in ('in_progress','completed') then
    raise exception 'invalid_state';
  end if;
  perform set_config('lushira.bypass_guard', 'on', true);
  update bookings set payment_status = 'cash_collected' where id = b.id;
  perform set_config('lushira.bypass_guard', 'off', true);
  update payments set status = 'cash_collected', collected_by = uid, collected_at = now()
  where booking_id = b.id and method = 'cash';
  insert into audit_logs (actor_id, action, entity, entity_id, details)
  values (uid, 'cash_collected', 'booking', b.id::text, jsonb_build_object('amount_inr', b.total_inr));
end $$;

-- ---------- partner onboarding & admin approval ----------
create or replace function public.become_partner()
returns void language plpgsql security definer set search_path = public as $$
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated'; end if;
  insert into user_roles (user_id, role) values ((select auth.uid()), 'partner') on conflict do nothing;
end $$;

create or replace function public.submit_salon_for_review(p_salon_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := (select auth.uid()); s public.salons;
begin
  select * into s from salons x where x.id = p_salon_id and x.owner_id = uid;
  if not found then raise exception 'not_found'; end if;
  if s.status not in ('draft','rejected') then raise exception 'already_submitted'; end if;
  if s.location is null then raise exception 'location_required'; end if;
  if s.contact_phone is null or s.address_line is null then raise exception 'contact_required'; end if;
  if not exists (select 1 from salon_services ss where ss.salon_id = s.id and ss.is_active) then raise exception 'services_required'; end if;
  if not exists (select 1 from salon_business_hours h where h.salon_id = s.id) then raise exception 'hours_required'; end if;
  update salons set status = 'pending' where id = s.id;
  insert into partner_applications (user_id, salon_id) values (uid, s.id);
end $$;

create or replace function public.admin_review_salon(p_salon_id uuid, p_decision text, p_reason text default null)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := (select auth.uid()); s public.salons;
begin
  if not private.is_admin() then raise exception 'forbidden'; end if;
  if p_decision not in ('approved','rejected','suspended') then raise exception 'invalid_decision'; end if;
  select * into s from salons x where x.id = p_salon_id;
  if not found then raise exception 'not_found'; end if;
  update salons set status = p_decision::public.salon_status,
         rejection_reason = case when p_decision = 'approved' then null else left(p_reason, 500) end
  where id = s.id;
  update partner_applications set status = case when p_decision = 'approved' then 'approved' else 'rejected' end,
         reviewed_by = uid, reviewed_at = now(), notes = left(p_reason, 500)
  where salon_id = s.id and status = 'pending';
  insert into notifications (user_id, title, body, kind)
  values (s.owner_id, 'Salon ' || p_decision,
          case when p_decision = 'approved' then 'Your salon is now live on Lushira.' else coalesce(left(p_reason, 200), 'Please contact support for details.') end,
          'partner_status');
  insert into audit_logs (actor_id, action, entity, entity_id, details)
  values (uid, 'salon_' || p_decision, 'salon', s.id::text, jsonb_build_object('reason', p_reason));
end $$;

create or replace function public.admin_moderate_review(p_review_id uuid, p_visible boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not private.is_admin() then raise exception 'forbidden'; end if;
  update reviews set is_visible = p_visible, reported = false where id = p_review_id;
  insert into audit_logs (actor_id, action, entity, entity_id, details)
  values ((select auth.uid()), 'review_moderated', 'review', p_review_id::text, jsonb_build_object('visible', p_visible));
end $$;

create or replace function public.report_review(p_review_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated'; end if;
  update reviews set reported = true, report_reason = left(p_reason, 300) where id = p_review_id;
end $$;

-- ---------- booking contact (only for the customer who owns the booking) ----------
create or replace function public.get_booking_contact(p_booking_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare b public.bookings; s public.salons; staff_name text;
begin
  select * into b from bookings x where x.id = p_booking_id and x.customer_id = (select auth.uid());
  if not found then raise exception 'not_found'; end if;
  select * into s from salons x where x.id = b.salon_id;
  select st.name into staff_name from salon_staff st where st.id = b.staff_id;
  return jsonb_build_object('salon_name', s.name, 'salon_phone', s.contact_phone, 'provider_name', staff_name,
    'salon_lat', st_y(s.location::geometry), 'salon_lng', st_x(s.location::geometry),
    'salon_address', concat_ws(', ', s.address_line, s.area, s.city));
end $$;

-- ---------- privacy: data export ----------
create or replace function public.export_my_data()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  return jsonb_build_object(
    'profile', (select to_jsonb(p) from profiles p where p.id = uid),
    'addresses', coalesce((select jsonb_agg(to_jsonb(a) - 'user_id') from customer_addresses a where a.user_id = uid), '[]'::jsonb),
    'bookings', coalesce((select jsonb_agg(to_jsonb(b)) from bookings b where b.customer_id = uid), '[]'::jsonb),
    'reviews', coalesce((select jsonb_agg(to_jsonb(r)) from reviews r where r.customer_id = uid), '[]'::jsonb),
    'favorites', coalesce((select jsonb_agg(f.salon_id) from favorites f where f.user_id = uid), '[]'::jsonb));
end $$;

-- ---------- abandoned online payments ----------
create or replace function public.expire_unpaid_bookings()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform set_config('lushira.bypass_guard', 'on', true);
  with x as (
    update bookings set status = 'cancelled', cancel_reason = 'payment_timeout', cancelled_at = now(), payment_status = 'failed'
    where payment_method = 'razorpay' and payment_status in ('unpaid','pending') and status = 'pending'
      and created_at < now() - interval '30 minutes'
    returning id)
  select count(*) into n from x;
  update payments set status = 'failed', failure_reason = 'payment_timeout'
  where status = 'pending' and method = 'razorpay' and created_at < now() - interval '30 minutes';
  perform set_config('lushira.bypass_guard', 'off', true);
  return n;
end $$;

-- ---------- execute permissions ----------
revoke execute on function public.create_booking(uuid, jsonb, timestamptz, public.service_mode, uuid, text, text, text, text, jsonb, double precision, double precision, public.payment_method, text) from public, anon;
revoke execute on function public.cancel_booking(uuid, text), public.request_refund(uuid, text), public.mark_cash_collected(uuid),
  public.become_partner(), public.submit_salon_for_review(uuid), public.admin_review_salon(uuid, text, text),
  public.admin_moderate_review(uuid, boolean), public.report_review(uuid, text), public.get_booking_contact(uuid),
  public.export_my_data(), public.validate_coupon(text, uuid, numeric) from public, anon;
grant execute on function public.create_booking(uuid, jsonb, timestamptz, public.service_mode, uuid, text, text, text, text, jsonb, double precision, double precision, public.payment_method, text) to authenticated;
grant execute on function public.cancel_booking(uuid, text), public.request_refund(uuid, text), public.mark_cash_collected(uuid),
  public.become_partner(), public.submit_salon_for_review(uuid), public.admin_review_salon(uuid, text, text),
  public.admin_moderate_review(uuid, boolean), public.report_review(uuid, text), public.get_booking_contact(uuid),
  public.export_my_data(), public.validate_coupon(text, uuid, numeric) to authenticated;
revoke execute on function public.expire_unpaid_bookings() from public, anon, authenticated;
grant execute on function public.expire_unpaid_bookings() to service_role;
grant execute on function public.get_available_slots(uuid, date, int, uuid, int) to anon, authenticated;
grant execute on function public.nearby_salons(double precision, double precision, numeric, text, text, boolean, int) to anon, authenticated;
grant execute on function public.search_services(text, text, double precision, double precision, numeric, numeric, text, numeric, text, int) to anon, authenticated;
