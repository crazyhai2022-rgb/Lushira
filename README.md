# Lushira — Beauty at Your Doorstep

Mobile-first PWA marketplace for at-home beauty services (Zomato-style: book online, the beautician comes to your home).
React + TypeScript + Vite + Tailwind v4 · Supabase (Postgres/PostGIS, Auth, RLS, Realtime, Storage, Edge Functions) · Razorpay · Leaflet/OpenStreetMap (Mapbox optional).

## Run locally
```bash
npm install
cp .env.example .env.local   # fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (publishable key)
npm run dev                  # http://localhost:5173
npm run build                # typecheck + production build (dist/)
```
Only public values go in `VITE_*`. Razorpay **secret**, webhook secret and SMS credentials are Edge Function secrets — never in the frontend.

## Database
`supabase/migrations/*.sql` (applied in order, already applied to project `otfkzppnzjrksruwhjuv`). Search radius (5 km), tax, fee, cancellation window and payment toggles live in `app_settings` and are editable in **Admin → Settings**.

### Make yourself admin
Sign up in the app, then in the Supabase SQL editor:
```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'YOUR_EMAIL';
```
Partners get their role automatically when they register at `/partner/register`.

## Setup checklist
1. **Auth → URL configuration:** set Site URL to your deployed URL and add `http://localhost:5173/**` to redirect URLs.
2. **Mobile OTP (live, APITxT):** customers and partners register/log in with a 10-digit Indian mobile number only (no email). The `mobile-auth` Edge Function generates the 6-digit OTP, stores only its HMAC hash (10-min expiry, 5 attempts, single use), sends the SMS via APITxT and rate-limits by mobile (5/hour, 45 s resend gap) and IP. The APITxT auth key is stored server-side in `payment_secrets` (key `apitxt_auth_key`, no client access) — never in the frontend or repo. Accounts use an internal address `<mobile>@phone.lushira.app` (never shown, never emailed). Admins still log in with email + password via *Admin? Log in with email* on `/login`.
3. (Old `send-sms-hook` / Supabase phone provider are no longer used.)
4. **Razorpay (no env vars needed):** log in as admin → **Admin → Payments & refunds → Razorpay online payments**, paste Key ID + Key Secret (+ optional Webhook Secret) and press *Save & activate*. Keys are verified with Razorpay, the secret is stored server-side only (`payment_secrets`, no client access) and online payments switch on at checkout. Add the webhook shown on that panel in Razorpay (`.../functions/v1/razorpay-webhook`; events `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`, `refund.failed`). Start with test keys.
5. **Maps:** works out of the box with OpenStreetMap tiles + Nominatim search. For production traffic set `VITE_MAPBOX_TOKEN` and respect the OSM/Nominatim usage policy.
6. **Salon discovery:** no salons are pre-loaded (nothing is invented). Salons appear when partners register and an admin approves them (Admin → Salons). Only import businesses you have permission to list.
7. Unpaid online bookings auto-expire after 30 min (`pg_cron` job `lushira-expire-unpaid`, already scheduled).

## Edge Functions (`supabase/functions`, deployed)
`razorpay-create-order`, `razorpay-verify`, `razorpay-webhook` (no JWT; HMAC-verified, idempotent via `webhook_events`), `razorpay-refund` (admin only), `admin-save-razorpay` (admin only), `mobile-auth` (no JWT; OTP send/verify with rate limits), `send-sms-hook` (legacy, unused).

## Routes
`/` · `/categories` · `/services` · `/service/:id` · `/salons` · `/salon/:slug` · `/wedding` · `/brands` · `/cart` · `/checkout` · `/order/:id` · `/orders` · `/track` · `/track/:id` · `/login` · `/signup` · `/profile` · `/about` · `/contact` · `/faq` · `/help` · `/privacy` · `/terms` · `/refund-policy` · `/partner` · `/partner/register` · `/partner/login` · `/partner/dashboard` (standalone partner portal; partners never see the customer site) · `/admin` · `/403` · 404

## Security notes
RLS on every table; bookings are created only through the `create_booking` RPC (server-side pricing, slot and coupon checks); double-booking is blocked by a Postgres exclusion constraint; payment status changes only through signature-verified Edge Functions; staff phones/owner details are never publicly readable; device geolocation is requested only after an explicit button press.

## Known limitations
- Staff accounts (a beautician logging in separately) are not wired in the UI; the owner assigns staff and shares live location from the owner dashboard.
- No ETA, only straight-line distance (no routing provider configured).
- Policy pages are sensible drafts — get them reviewed by a lawyer before launch.
- Notifications are in-app only (no push/email/SMS booking alerts).
- Razorpay and mobile OTP are untested end-to-end because no credentials were provided.
