-- 1) Completion lock: a booking can only be completed after payment is settled (online paid, or cash collected).
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
    new.payment_status := old.payment_status;
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
        new.status := old.status;
      end if;
      -- completion lock
      if new.status = 'completed' and old.payment_status not in ('paid', 'cash_collected') then
        new.status := old.status;
      end if;
    end if;
  end if;
  if new.status = 'cancelled' and new.cancelled_at is null then new.cancelled_at := now(); end if;
  return new;
end $$;

-- 2) Chat also works while the request is still pending (so the customer can talk to the salon right after booking)
create or replace function public.send_booking_message(p_booking_id uuid, p_body text default null, p_image_path text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := (select auth.uid()); b public.bookings; mid uuid; txt text := nullif(btrim(coalesce(p_body, '')), '');
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not private.is_booking_participant(p_booking_id) then raise exception 'forbidden'; end if;
  select * into b from bookings where id = p_booking_id;
  if b.status not in ('pending','confirmed','provider_assigned','on_the_way','in_progress','completed') then raise exception 'chat_not_available'; end if;
  if txt is null and p_image_path is null then raise exception 'empty_message'; end if;
  if p_image_path is not null and split_part(p_image_path, '/', 1) <> p_booking_id::text then raise exception 'bad_image'; end if;
  insert into booking_messages (booking_id, sender_id, body, image_path) values (p_booking_id, uid, txt, p_image_path) returning id into mid;
  return mid;
end $$;
