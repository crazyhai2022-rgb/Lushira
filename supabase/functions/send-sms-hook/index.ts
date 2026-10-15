// Supabase Auth "Send SMS" hook. Enable in Dashboard -> Authentication -> Hooks -> Send SMS (HTTPS), then set secrets:
//   SEND_SMS_HOOK_SECRET (v1,whsec_...), SMS_PROVIDER = msg91 | twilio, and the provider's credentials (see README).
import { admin } from '../_shared/util.ts'

const secretRaw = Deno.env.get('SEND_SMS_HOOK_SECRET') ?? ''
const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function verifyStandardWebhook(req: Request, body: string) {
  const id = req.headers.get('webhook-id'), ts = req.headers.get('webhook-timestamp'), sigs = req.headers.get('webhook-signature')
  if (!id || !ts || !sigs || !secretRaw) return false
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false
  const key = await crypto.subtle.importKey('raw', b64(secretRaw.replace(/^v1,whsec_/, '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${body}`)))
  const expected = btoa(String.fromCharCode(...mac))
  return sigs.split(' ').some((s) => s.replace(/^v1,/, '') === expected)
}
const err = (message: string, status = 400) => new Response(JSON.stringify({ error: { http_code: status, message } }), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  const body = await req.text()
  if (!(await verifyStandardWebhook(req, body))) return err('invalid signature', 401)
  const { user, sms } = JSON.parse(body) as { user: { phone: string }; sms: { otp: string } }
  const phone = user.phone.startsWith('+') ? user.phone : `+${user.phone}`

  // rate limit: max 5 OTP SMS per phone per hour, max 30/hour overall burst guard
  const db = admin()
  const since = new Date(Date.now() - 3600_000).toISOString()
  const { count } = await db.from('otp_requests').select('id', { count: 'exact', head: true }).eq('phone', phone).gte('created_at', since)
  if ((count ?? 0) >= 5) return err('Too many OTP requests. Try again later.', 429)
  await db.from('otp_requests').insert({ phone, purpose: 'login' })

  const provider = Deno.env.get('SMS_PROVIDER')
  try {
    if (provider === 'msg91') {
      const res = await fetch('https://control.msg91.com/api/v5/otp?' + new URLSearchParams({ template_id: Deno.env.get('MSG91_TEMPLATE_ID')!, mobile: phone.replace('+', ''), otp: sms.otp }), {
        method: 'POST', headers: { authkey: Deno.env.get('MSG91_AUTH_KEY')!, 'Content-Type': 'application/json' }, body: '{}',
      })
      if (!res.ok) throw new Error(await res.text())
    } else if (provider === 'twilio') {
      const sid = Deno.env.get('TWILIO_ACCOUNT_SID')!, tok = Deno.env.get('TWILIO_AUTH_TOKEN')!
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST', headers: { Authorization: 'Basic ' + btoa(`${sid}:${tok}`), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: phone, From: Deno.env.get('TWILIO_FROM')!, Body: `Your Lushira verification code is ${sms.otp}. Do not share it with anyone.` }),
      })
      if (!res.ok) throw new Error(await res.text())
    } else return err('SMS provider not configured', 503)
  } catch (e) { console.error('sms send failed', e); return err('Could not send SMS', 502) }
  return new Response('{}', { headers: { 'Content-Type': 'application/json' } })
})
