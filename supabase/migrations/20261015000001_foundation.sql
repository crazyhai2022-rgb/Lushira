-- Lushira foundation: extensions, enums, profiles, roles, helpers
create extension if not exists postgis with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists btree_gist with schema extensions;

create schema if not exists private;
grant usage on schema private to authenticated, service_role;

-- ---------- enums ----------
create type public.app_role as enum ('customer', 'partner', 'admin');
create type public.salon_status as enum ('draft', 'pending', 'approved', 'rejected', 'suspended');
create type public.service_mode as enum ('salon', 'home');
create type public.booking_status as enum (
  'pending',        -- created, awaiting provider
  'confirmed',      -- provider accepted
  'provider_assigned',
  'on_the_way',     -- at-home only
  'in_progress',
  'completed',
  'cancelled',
  'rejected',
  'no_show'
);
create type public.payment_method as enum ('razorpay', 'cash');
create type public.payment_status as enum (
  'unpaid', 'pending', 'paid', 'failed', 'refund_pending', 'refunded', 'cash_due', 'cash_collected'
);
create type public.refund_status as enum ('requested', 'approved', 'processing', 'processed', 'rejected', 'failed');
create type public.ticket_status as enum ('open', 'in_progress', 'resolved', 'closed');

-- ---------- timestamps helper ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  phone text check (phone is null or phone ~ '^\+?[0-9]{10,15}$'),
  phone_verified boolean not null default false,
  email text check (email is null or char_length(email) <= 254),
  avatar_url text,
  marketing_opt_in boolean not null default false,
  location_consent boolean not null default false,
  deletion_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_phone_unique on public.profiles (phone) where phone is not null;
create trigger profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- roles (assigned only by admins / service role; never by clients)
create table public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- ---------- role helpers (private schema, not exposed over the API) ----------
create or replace function private.has_role(_role public.app_role)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role = _role);
$$;
create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'admin');
$$;
grant execute on function private.has_role(public.app_role) to authenticated, service_role;
grant execute on function private.is_admin() to authenticated, service_role;

-- new auth user -> profile + customer role
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, email, phone, phone_verified)
  values (
    new.id,
    coalesce(left(new.raw_user_meta_data ->> 'full_name', 120), ''),
    new.email,
    nullif(regexp_replace(coalesce(new.phone, ''), '[^0-9+]', '', 'g'), ''),
    new.phone_confirmed_at is not null
  )
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'customer') on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------- platform settings ----------
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
insert into public.app_settings (key, value, description) values
  ('search_radius_km', '5'::jsonb, 'Nearby salon radius, measured from the customer''s coordinates or the locality they select'),
  ('currency', '"INR"'::jsonb, 'Currency code'),
  ('tax_percent', '18'::jsonb, 'GST percentage applied to services'),
  ('platform_fee_inr', '0'::jsonb, 'Flat platform fee per booking'),
  ('business_email', '"Lushiraindia07@gmail.com"'::jsonb, 'Public support email'),
  ('business_phone', '"+919241383828"'::jsonb, 'Public support phone'),
  ('service_area_label', '"Padora / B.B. Ganj, Bihar"'::jsonb, 'Initial launch area (confirm exact locality before launch)'),
  ('cancellation_window_hours', '4'::jsonb, 'Free cancellation until this many hours before the appointment'),
  ('cash_payments_enabled', 'true'::jsonb, 'Allow cash on service'),
  ('online_payments_enabled', 'true'::jsonb, 'Allow Razorpay (works only when keys are configured)');

-- ---------- audit log ----------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity, created_at desc);
