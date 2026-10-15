-- Bookings, payments and supporting tables
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default (
    'LSH' || to_char(now() at time zone 'Asia/Kolkata', 'YYMMDD') || '-' ||
    upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5))
  ),
  customer_id uuid not null references auth.users(id) on delete restrict,
  salon_id uuid not null references public.salons(id) on delete restrict,
  staff_id uuid references public.salon_staff(id) on delete set null,
  resource_key text not null,                 -- staff id, or "lane-N" when no staff chosen
  mode public.service_mode not null default 'salon',
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  blocked_until timestamptz not null,         -- end + buffer; used by the overlap constraint
  status public.booking_status not null default 'pending',
  customer_name text not null check (char_length(customer_name) between 2 and 120),
  customer_phone text not null check (customer_phone ~ '^\+?[0-9]{10,15}$'),
  customer_email text,
  notes text check (notes is null or char_length(notes) <= 500),
  address jsonb,                              -- required for home service
  address_location extensions.geography(Point, 4326),
  subtotal_inr numeric(10,2) not null check (subtotal_inr >= 0),
  discount_inr numeric(10,2) not null default 0 check (discount_inr >= 0),
  tax_inr numeric(10,2) not null default 0 check (tax_inr >= 0),
  fee_inr numeric(10,2) not null default 0 check (fee_inr >= 0),
  total_inr numeric(10,2) not null check (total_inr >= 0),
  coupon_id uuid references public.coupons(id) on delete set null,
  payment_method public.payment_method not null,
  payment_status public.payment_status not null default 'unpaid',
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scheduled_end > scheduled_start and blocked_until >= scheduled_end),
  check (mode = 'salon' or address is not null),
  -- hard guarantee against double booking: one resource cannot overlap itself
  constraint bookings_no_overlap exclude using gist (
    salon_id with =,
    resource_key with =,
    tstzrange(scheduled_start, blocked_until, '[)') with &&
  ) where (status in ('pending','confirmed','provider_assigned','on_the_way','in_progress'))
);
create index bookings_customer_idx on public.bookings (customer_id, scheduled_start desc);
create index bookings_salon_idx on public.bookings (salon_id, scheduled_start desc);
create index bookings_staff_idx on public.bookings (staff_id);
create index bookings_status_idx on public.bookings (status);
create trigger bookings_updated before update on public.bookings for each row execute function public.set_updated_at();

create table public.booking_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  salon_service_id uuid references public.salon_services(id) on delete set null,
  name text not null,
  price_inr numeric(10,2) not null check (price_inr >= 0),
  duration_min int not null check (duration_min > 0),
  quantity int not null default 1 check (quantity between 1 and 10)
);
create index booking_items_booking_idx on public.booking_items (booking_id);

create table public.booking_status_history (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  status public.booking_status not null,
  changed_by uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index booking_status_history_idx on public.booking_status_history (booking_id, created_at);

-- one live location row per booking (updated in place, streamed via Realtime)
create table public.provider_locations (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  provider_id uuid not null references auth.users(id) on delete cascade,
  location extensions.geography(Point, 4326) not null,
  accuracy_m numeric(8,2),
  heading numeric(5,2),
  recorded_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  method public.payment_method not null,
  amount_inr numeric(10,2) not null check (amount_inr >= 0),
  currency text not null default 'INR',
  status public.payment_status not null default 'pending',
  razorpay_order_id text unique,
  razorpay_payment_id text unique,
  failure_reason text,
  collected_by uuid references auth.users(id),
  collected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_booking_idx on public.payments (booking_id);
create trigger payments_updated before update on public.payments for each row execute function public.set_updated_at();

-- webhook idempotency: each Razorpay event id is processed at most once
create table public.webhook_events (
  event_id text primary key,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  booking_id uuid not null references public.bookings(id) on delete restrict,
  amount_inr numeric(10,2) not null check (amount_inr > 0),
  reason text,
  status public.refund_status not null default 'requested',
  razorpay_refund_id text unique,
  requested_by uuid references auth.users(id),
  reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index refunds_booking_idx on public.refunds (booking_id);
create trigger refunds_updated before update on public.refunds for each row execute function public.set_updated_at();

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  salon_id uuid not null references public.salons(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 1000),
  is_visible boolean not null default true,
  reported boolean not null default false,
  report_reason text,
  created_at timestamptz not null default now()
);
create index reviews_salon_idx on public.reviews (salon_id, created_at desc);

create table public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  salon_id uuid not null references public.salons(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, salon_id)
);

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Home' check (char_length(label) <= 40),
  line1 text not null check (char_length(line1) between 3 and 200),
  landmark text,
  area text,
  city text,
  state text,
  pin_code text check (pin_code is null or pin_code ~ '^[0-9]{6}$'),
  location extensions.geography(Point, 4326),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index customer_addresses_user_idx on public.customer_addresses (user_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text,
  kind text not null default 'general',
  booking_id uuid references public.bookings(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  name text not null check (char_length(name) between 2 and 120),
  email text,
  phone text,
  subject text not null check (char_length(subject) between 3 and 150),
  message text not null check (char_length(message) between 5 and 2000),
  status public.ticket_status not null default 'open',
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger support_tickets_updated before update on public.support_tickets for each row execute function public.set_updated_at();

create table public.partner_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  salon_id uuid references public.salons(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  notes text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index partner_applications_status_idx on public.partner_applications (status, created_at desc);

-- OTP abuse protection (service role only)
create table public.otp_requests (
  id bigint generated always as identity primary key,
  phone text not null,
  ip text,
  purpose text not null default 'login',
  success boolean,
  created_at timestamptz not null default now()
);
create index otp_requests_phone_idx on public.otp_requests (phone, created_at desc);
create index otp_requests_ip_idx on public.otp_requests (ip, created_at desc);

-- ---------- triggers ----------
-- status history + customer notification on every status change
create or replace function public.bookings_log_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.booking_status_history (booking_id, status, changed_by)
    values (new.id, new.status, (select auth.uid()));
    insert into public.notifications (user_id, title, body, kind, booking_id)
    values (
      new.customer_id,
      'Booking ' || replace(new.status::text, '_', ' '),
      'Your booking ' || new.reference || ' is now ' || replace(new.status::text, '_', ' ') || '.',
      'booking', new.id
    );
  end if;
  return new;
end $$;
create trigger bookings_status_log after insert or update of status on public.bookings
  for each row execute function public.bookings_log_status();
revoke execute on function public.bookings_log_status() from public, anon, authenticated;

-- restrict what non-admin writers can change on a booking
create or replace function public.bookings_guard()
returns trigger language plpgsql set search_path = '' as $$
declare is_priv boolean;
begin
  is_priv := coalesce((select auth.role()), '') = 'service_role' or private.is_admin();
  if tg_op = 'UPDATE' and not is_priv then
    -- immutable for partners/providers
    new.customer_id := old.customer_id; new.salon_id := old.salon_id; new.resource_key := old.resource_key;
    new.scheduled_start := old.scheduled_start; new.scheduled_end := old.scheduled_end; new.blocked_until := old.blocked_until;
    new.subtotal_inr := old.subtotal_inr; new.discount_inr := old.discount_inr; new.tax_inr := old.tax_inr;
    new.fee_inr := old.fee_inr; new.total_inr := old.total_inr; new.coupon_id := old.coupon_id;
    new.payment_method := old.payment_method; new.reference := old.reference; new.mode := old.mode;
    new.customer_name := old.customer_name; new.customer_phone := old.customer_phone; new.address := old.address;
    -- payment status: only cash collection by the provider side
    if new.payment_status is distinct from old.payment_status
       and not (old.payment_status = 'cash_due' and new.payment_status = 'cash_collected' and old.payment_method = 'cash') then
      new.payment_status := old.payment_status;
    end if;
    -- legal status transitions
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
      -- "on the way" only makes sense for at-home bookings
      if new.status = 'on_the_way' and old.mode <> 'home' then new.status := old.status; end if;
    end if;
  end if;
  if new.status = 'cancelled' and new.cancelled_at is null then new.cancelled_at := now(); end if;
  return new;
end $$;
create trigger bookings_guard_trg before update on public.bookings
  for each row execute function public.bookings_guard();

-- keep salon rating aggregates correct
create or replace function public.refresh_salon_rating()
returns trigger language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  sid := coalesce(new.salon_id, old.salon_id);
  update public.salons s set
    rating_avg = coalesce((select round(avg(rating)::numeric, 2) from public.reviews where salon_id = sid and is_visible), 0),
    rating_count = (select count(*) from public.reviews where salon_id = sid and is_visible)
  where s.id = sid;
  return null;
end $$;
create trigger reviews_rating after insert or update or delete on public.reviews
  for each row execute function public.refresh_salon_rating();
revoke execute on function public.refresh_salon_rating() from public, anon, authenticated;
