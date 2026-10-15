-- Mobile-number OTP auth (OTP generated/verified by us; APITxT only delivers the SMS)
create table public.mobile_otps (
  id bigint generated always as identity primary key,
  mobile text not null check (mobile ~ '^[6-9][0-9]{9}$'),
  purpose text not null check (purpose in ('signup','login','reset')),
  otp_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  unique (mobile, purpose)
);
alter table public.mobile_otps enable row level security;
revoke all on public.mobile_otps from anon, authenticated;

-- find an account by its 10-digit mobile (service role only)
create or replace function public.auth_user_by_mobile(p_mobile text)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from auth.users where email = p_mobile || '@phone.lushira.app' limit 1
$$;
revoke execute on function public.auth_user_by_mobile(text) from public, anon, authenticated;
grant execute on function public.auth_user_by_mobile(text) to service_role;

-- never show the internal mobile-login address as a real email
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, email, phone, phone_verified)
  values (
    new.id,
    coalesce(left(new.raw_user_meta_data ->> 'full_name', 120), ''),
    case when new.email like '%@phone.lushira.app' then null else new.email end,
    nullif(regexp_replace(coalesce(new.phone, ''), '[^0-9+]', '', 'g'), ''),
    new.phone_confirmed_at is not null
  )
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'customer') on conflict do nothing;
  return new;
end $$;
