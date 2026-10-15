-- Razorpay credentials entered from Admin → Payments. Secret is stored server-side only (no client grants).
create table if not exists public.payment_secrets (
  key text primary key,
  value text not null,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.payment_secrets enable row level security;
revoke all on public.payment_secrets from anon, authenticated;

insert into public.app_settings (key, value, description)
values ('razorpay_key_id', '""'::jsonb, 'Public Razorpay key id (set from Admin → Payments). Secret lives in payment_secrets.')
on conflict (key) do nothing;
