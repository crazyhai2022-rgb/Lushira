# Lushira — Beauty at Your Doorstep

Mobile-first PWA marketplace for salons, parlours and at-home beauty services.
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
2. **Email OTP:** Auth → Email Templates → *Magic Link* (and *Confirm signup*): include `{{ .Token }}` so users receive a 6-digit code (the link keeps working too). Configure custom SMTP for production volume.
3. **Mobile OTP (optional, needs your SMS provider):** the `send-sms-hook` function is deployed. Then
   - Auth → Providers → Phone → enable; Auth → Hooks → *Send SMS* → HTTPS → `https://<project>.supabase.co/functions/v1/send-sms-hook`, generate the secret.
   - Function secrets: `SEND_SMS_HOOK_SECRET` (the `v1,whsec_…` value), and either `SMS_PROVIDER=msg91` + `MSG91_AUTH_KEY` + `MSG91_TEMPLATE_ID` (India needs a DLT-registered template) or `SMS_PROVIDER=twilio` + `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_FROM`.
   - Set `VITE_PHONE_OTP_ENABLED=true` and rebuild. Until then the UI honestly shows "being set up".
4. **Razorpay:** create keys in the Razorpay dashboard (test mode first).
   - Function secrets: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
   - Frontend: `VITE_RAZORPAY_KEY_ID` (public key id only). Without it checkout offers cash only.
   - Webhook URL `https://<project>.supabase.co/functions/v1/razorpay-webhook`; events: `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`, `refund.failed`.
5. **Maps:** works out of the box with OpenStreetMap tiles + Nominatim search. For production traffic set `VITE_MAPBOX_TOKEN` and respect the OSM/Nominatim usage policy.
6. **Salon discovery:** no salons are pre-loaded (nothing is invented). Salons appear when partners register and an admin approves them (Admin → Salons). Only import businesses you have permission to list.
7. Unpaid online bookings auto-expire after 30 min (`pg_cron` job `lushira-expire-unpaid`, already scheduled).

## Edge Functions (`supabase/functions`, deployed)
`razorpay-create-order`, `razorpay-verify`, `razorpay-webhook` (no JWT; HMAC-verified, idempotent via `webhook_events`), `razorpay-refund` (admin only), `send-sms-hook` (no JWT; Standard Webhooks signature, 5 OTP/hour/phone).

## Routes
`/` · `/categories` · `/services` · `/service/:id` · `/salons` · `/salon/:slug` · `/wedding` · `/brands` · `/cart` · `/checkout` · `/order/:id` · `/orders` · `/track` · `/track/:id` · `/login` · `/signup` · `/profile` · `/about` · `/contact` · `/faq` · `/help` · `/privacy` · `/terms` · `/refund-policy` · `/partner` · `/partner/register` · `/partner/dashboard` · `/admin` · `/403` · 404

## Security notes
RLS on every table; bookings are created only through the `create_booking` RPC (server-side pricing, slot and coupon checks); double-booking is blocked by a Postgres exclusion constraint; payment status changes only through signature-verified Edge Functions; staff phones/owner details are never publicly readable; device geolocation is requested only after an explicit button press.

## Known limitations
- Staff accounts (a beautician logging in separately) are not wired in the UI; the owner assigns staff and shares live location from the owner dashboard.
- No ETA, only straight-line distance (no routing provider configured).
- Policy pages are sensible drafts — get them reviewed by a lawyer before launch.
- Notifications are in-app only (no push/email/SMS booking alerts).
- Razorpay and mobile OTP are untested end-to-end because no credentials were provided.
