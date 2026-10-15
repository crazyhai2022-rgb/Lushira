-- Catalog, salons, brands, services, availability, coupons, banners
create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.service_categories(id) on delete set null,
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique,
  description text,
  image_url text,
  icon text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index service_categories_parent_idx on public.service_categories (parent_id);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.service_categories(id) on delete set null,
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique,
  description text,
  image_url text,
  default_duration_min int check (default_duration_min between 5 and 720),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index services_category_idx on public.services (category_id);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique,
  logo_url text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.salons (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  name text not null check (char_length(name) between 2 and 120),
  slug text unique,
  business_type text,
  description text check (description is null or char_length(description) <= 500),
  contact_phone text check (contact_phone is null or contact_phone ~ '^\+?[0-9]{10,15}$'),
  contact_email text check (contact_email is null or char_length(contact_email) <= 254),
  logo_url text,
  cover_url text,
  country text not null default 'India',
  state text,
  city text,
  area text,
  address_line text,
  landmark text,
  pin_code text check (pin_code is null or pin_code ~ '^[0-9]{6}$'),
  location extensions.geography(Point, 4326),
  status public.salon_status not null default 'draft',
  rejection_reason text,
  featured boolean not null default false,
  home_service boolean not null default false,
  appointment_required boolean not null default true,
  walk_in boolean not null default false,
  facilities jsonb not null default '{}'::jsonb,
  concurrent_capacity int not null default 1 check (concurrent_capacity between 1 and 50),
  cancellation_policy text,
  rating_avg numeric(3,2) not null default 0,
  rating_count int not null default 0,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index salons_location_gix on public.salons using gist (location);
create index salons_status_idx on public.salons (status);
create index salons_owner_idx on public.salons (owner_id);
create index salons_name_trgm on public.salons using gin (name extensions.gin_trgm_ops);
create index salons_city_idx on public.salons (city, area);
create trigger salons_updated before update on public.salons for each row execute function public.set_updated_at();

create or replace function public.salons_before_write()
returns trigger language plpgsql set search_path = '' as $$
declare is_priv boolean;
begin
  is_priv := coalesce((select auth.role()), '') = 'service_role' or private.is_admin();
  if tg_op = 'INSERT' then
    if not is_priv then
      new.status := 'draft'; new.featured := false;
      new.rating_avg := 0; new.rating_count := 0; new.approved_at := null; new.rejection_reason := null;
    end if;
  else
    if not is_priv then
      new.owner_id := old.owner_id;
      new.featured := old.featured;
      new.rating_avg := old.rating_avg;
      new.rating_count := old.rating_count;
      new.approved_at := old.approved_at;
      new.rejection_reason := old.rejection_reason;
      -- owners may only submit for review; they can never approve/suspend themselves
      if new.status is distinct from old.status then
        if not (old.status in ('draft','rejected') and new.status = 'pending') then
          new.status := old.status;
        end if;
      end if;
    elsif new.status = 'approved' and old.status is distinct from 'approved' then
      new.approved_at := now();
    end if;
  end if;
  if new.slug is null then
    new.slug := trim(both '-' from regexp_replace(lower(new.name), '[^a-z0-9]+', '-', 'g')) || '-' || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;
  return new;
end $$;
create trigger salons_guard before insert or update on public.salons
  for each row execute function public.salons_before_write();

-- private owner details (never public)
create table public.salon_private (
  salon_id uuid primary key references public.salons(id) on delete cascade,
  owner_name text,
  owner_phone text,
  owner_email text,
  gst_number text,
  updated_at timestamptz not null default now()
);

create table public.salon_images (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  url text not null,
  kind text not null default 'gallery' check (kind in ('gallery','interior','work','bridal')),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index salon_images_salon_idx on public.salon_images (salon_id);

create table public.salon_business_hours (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  opens time,
  closes time,
  is_closed boolean not null default false,
  unique (salon_id, weekday),
  check (is_closed or (opens is not null and closes is not null and closes > opens))
);

create table public.salon_staff (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null check (char_length(name) between 2 and 80),
  role_title text,
  photo_url text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index salon_staff_salon_idx on public.salon_staff (salon_id);
create index salon_staff_user_idx on public.salon_staff (user_id);

create table public.salon_service_areas (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  label text not null,
  center extensions.geography(Point, 4326) not null,
  radius_km numeric(5,2) not null default 5 check (radius_km > 0 and radius_km <= 100),
  is_active boolean not null default true
);
create index salon_service_areas_salon_idx on public.salon_service_areas (salon_id);

create table public.salon_services (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  category_id uuid references public.service_categories(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  name text not null check (char_length(name) between 2 and 120),
  description text,
  price_inr numeric(10,2) not null check (price_inr >= 0),
  duration_min int not null check (duration_min between 5 and 720),
  buffer_min int not null default 0 check (buffer_min between 0 and 120),
  at_salon boolean not null default true,
  at_home boolean not null default false,
  image_url text,
  is_wedding boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (at_salon or at_home)
);
create index salon_services_salon_idx on public.salon_services (salon_id) where is_active;
create index salon_services_category_idx on public.salon_services (category_id);
create index salon_services_name_trgm on public.salon_services using gin (name extensions.gin_trgm_ops);
create trigger salon_services_updated before update on public.salon_services for each row execute function public.set_updated_at();

create table public.service_images (
  id uuid primary key default gen_random_uuid(),
  salon_service_id uuid not null references public.salon_services(id) on delete cascade,
  url text not null,
  sort_order int not null default 0
);
create index service_images_service_idx on public.service_images (salon_service_id);

create table public.brand_services (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  category_id uuid references public.service_categories(id) on delete set null,
  name text not null,
  description text,
  price_inr numeric(10,2) check (price_inr is null or price_inr >= 0),
  is_active boolean not null default true
);
create index brand_services_brand_idx on public.brand_services (brand_id);

-- a salon claims it offers a brand service; shown publicly only once an admin verifies it
create table public.salon_brand_services (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  brand_service_id uuid not null references public.brand_services(id) on delete cascade,
  salon_service_id uuid references public.salon_services(id) on delete set null,
  verified boolean not null default false,
  verified_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (salon_id, brand_service_id)
);

create table public.provider_availability (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  staff_id uuid references public.salon_staff(id) on delete cascade,
  on_date date not null,
  is_blocked boolean not null default true, -- true = blackout / day off
  start_time time,
  end_time time,
  note text,
  check (is_blocked or (start_time is not null and end_time is not null and end_time > start_time))
);
create index provider_availability_idx on public.provider_availability (salon_id, on_date);

create table public.banners (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  image_url text,
  link_url text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create extension if not exists citext with schema extensions;
create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code extensions.citext not null unique check (code ~ '^[A-Za-z0-9_-]{3,30}$'),
  description text,
  discount_type text not null check (discount_type in ('percent','flat')),
  value numeric(10,2) not null check (value > 0),
  max_discount_inr numeric(10,2),
  min_order_inr numeric(10,2) not null default 0,
  starts_at timestamptz,
  expires_at timestamptz,
  usage_limit int,
  used_count int not null default 0,
  per_user_limit int not null default 1,
  salon_id uuid references public.salons(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (discount_type <> 'percent' or value <= 100)
);

-- default categories (configuration, not salon listings)
insert into public.service_categories (name, slug, description, sort_order) values
  ('Skincare', 'skincare', 'Facials and personalised skin treatments', 1),
  ('Hair Care', 'hair-care', 'Cuts, colour, spa and treatments', 2),
  ('Makeup', 'makeup', 'Everyday to party makeup', 3),
  ('Bridal Packages', 'bridal-packages', 'Complete wedding beauty packages', 4),
  ('Manicure & Pedicure', 'manicure-pedicure', 'Hand and foot care', 5),
  ('Threading & Waxing', 'threading-waxing', 'Hair removal services', 6),
  ('Body Care & Massage', 'body-care-massage', 'Relaxing body therapies', 7),
  ('Nail Extensions', 'nail-extensions', 'Nail art and extensions', 8),
  ('Eyelash & Eyebrow', 'eyelash-eyebrow', 'Lash and brow services', 9),
  ('Facial Treatments', 'facial-treatments', 'Brightening and anti-ageing facials', 10),
  ('Hair Styling', 'hair-styling', 'Styling for every occasion', 11),
  ('Wellness & Natural Care', 'wellness-natural-care', 'Holistic beauty treatments', 12);
