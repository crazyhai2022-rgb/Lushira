// Mobile-number OTP auth. We generate + verify the OTP ourselves; APITxT only delivers the SMS.
// Actions: send {mobile,purpose} · verify {mobile,purpose,code,full_name?,password?}
// On verify success returns {ok:true, token_hash} -> client calls supabase.auth.verifyOtp({token_hash,type:'magiclink'}).
import { admin, cors, hmacHex, json, safeEqual } from './util.ts'

const MOBILE = /^[6-9]\d{9}$/
const PURPOSES = ['signup', 'login', 'reset']
const DOMAINS = { customer: 'phone.lushira.app', partner: 'partner.lushira.app' } as const
type Kind = keyof typeof DOMAINS
const COOLDOWN_S = 45
const OTP_TTL_MIN = 10
const MAX_ATTEMPTS = 5
const MAX_SENDS_PER_MOBILE_HOUR = 5
const MAX_SENDS_PER_IP_HOUR = 15
const MAX_FAILS_PER_IP_15MIN = 30

const emailFor = (m: string, k: Kind) => `${m}@${DOMAINS[k]}`
const fail = (error: string, status = 400) => json({ ok: false, error }, status)

async function apiKey(db: ReturnType<typeof admin>) {
  const { data } = await db.from('payment_secrets').select('value').eq('key', 'apitxt_auth_key').maybeSingle()
  return (data?.value as string | undefined) || Deno.env.get('APITXT_AUTH_KEY') || null
}

async function sendSms(key: string, mobile: string, otp: string) {
  try {
    const res = await fetch('https://apitxt.com/api/sendOTP', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ authkey: key, mobile: '91' + mobile, otp, channel: 'sms', country: '91' }),
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json().catch(() => null)
    return !!data && data.status === 'success'
  } catch (e) {
    console.error('apitxt request failed', (e as Error).message)
    return false
  }
}

const hashOtp = (mobile: string, purpose: string, otp: string, kind: Kind) =>
  hmacHex(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, `otp:${kind}:${mobile}:${purpose}:${otp}`)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return fail('Method not allowed', 405)
  const body = await req.json().catch(() => ({}))
  const mobile = String(body.mobile ?? '').trim()
  const purpose = String(body.purpose ?? '')
  const kind: Kind = body.kind === 'partner' ? 'partner' : 'customer'   // customer and partner accounts are separate, even for the same mobile
  if (!MOBILE.test(mobile)) return fail('Please enter a valid 10-digit Indian mobile number (without +91 or 0).')
  if (!PURPOSES.includes(purpose)) return fail('Invalid request.')
  const ip = (req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
  const db = admin()
  const since = (ms: number) => new Date(Date.now() - ms).toISOString()
  const uidRes = await db.rpc('auth_user_by_login', { p_mobile: mobile, p_kind: kind })
  const uid = (uidRes.data as string | null) ?? null

  // ---------------- SEND ----------------
  if (body.action === 'send') {
    if (purpose === 'signup' && uid) return fail('This mobile number is already registered. Please log in.')
    if (purpose !== 'signup' && !uid) return fail('No account found for this number. Please sign up first.')

    const [byMobile, byIp] = await Promise.all([
      db.from('otp_requests').select('created_at').eq('phone', mobile).in('purpose', PURPOSES).gte('created_at', since(3600_000)).order('created_at', { ascending: false }),
      db.from('otp_requests').select('id', { count: 'exact', head: true }).eq('ip', ip).in('purpose', PURPOSES).gte('created_at', since(3600_000)),
    ])
    const sends = byMobile.data ?? []
    const last = sends[0] ? new Date(sends[0].created_at).getTime() : 0
    const wait = Math.ceil((last + COOLDOWN_S * 1000 - Date.now()) / 1000)
    if (wait > 0) return fail(`Please wait ${wait}s before requesting another code.`, 429)
    if (sends.length >= MAX_SENDS_PER_MOBILE_HOUR || (byIp.count ?? 0) >= MAX_SENDS_PER_IP_HOUR)
      return fail('Too many OTP requests. Please try again after some time.', 429)

    const key = await apiKey(db)
    if (!key) { console.error('APITxT key missing'); return fail('SMS service is not configured yet. Please contact support.', 503) }

    const otp = String(crypto.getRandomValues(new Uint32Array(1))[0] % 900000 + 100000)
    const up = await db.from('mobile_otps').upsert(
      { mobile, purpose, otp_hash: await hashOtp(mobile, purpose, otp, kind), expires_at: new Date(Date.now() + OTP_TTL_MIN * 60_000).toISOString(), attempts: 0, created_at: new Date().toISOString() },
      { onConflict: 'mobile,purpose' })
    if (up.error) { console.error(up.error.message); return fail('Could not send the OTP right now.', 500) }
    const ok = await sendSms(key, mobile, otp)
    await db.from('otp_requests').insert({ phone: mobile, ip, purpose, success: ok })
    if (!ok) {
      await db.from('mobile_otps').delete().eq('mobile', mobile).eq('purpose', purpose)
      return fail('Could not send the OTP right now. Please try again.', 502)
    }
    return json({ ok: true, cooldown: COOLDOWN_S })
  }

  // ---------------- VERIFY ----------------
  if (body.action === 'verify') {
    const code = String(body.code ?? '').trim()
    const fullName = String(body.full_name ?? '').trim()
    const password = String(body.password ?? '')
    if (!/^\d{6}$/.test(code)) return fail('Enter the 6-digit code.')
    // validate inputs first so a typo does not burn the OTP
    if (purpose === 'signup' && fullName.length < 2) return fail('Please enter your full name.')
    if ((purpose === 'signup' || purpose === 'reset') && password.length < 8) return fail('Password must be at least 8 characters.')
    if (purpose === 'signup' && uid) return fail('This mobile number is already registered. Please log in.')
    if (purpose !== 'signup' && !uid) return fail('No account found for this number.')

    const fails = await db.from('otp_requests').select('id', { count: 'exact', head: true }).eq('ip', ip).eq('purpose', 'verify_fail').gte('created_at', since(900_000))
    if ((fails.count ?? 0) >= MAX_FAILS_PER_IP_15MIN) return fail('Too many wrong attempts. Please try again later.', 429)

    const bad = async (msg: string) => { await db.from('otp_requests').insert({ phone: mobile, ip, purpose: 'verify_fail', success: false }); return fail(msg) }
    const { data: row } = await db.from('mobile_otps').select('*').eq('mobile', mobile).eq('purpose', purpose).maybeSingle()
    if (!row) return bad('Code expired or not requested. Please request a new code.')
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await db.from('mobile_otps').delete().eq('id', row.id)
      return bad('That code has expired. Please request a new one.')
    }
    if (row.attempts >= MAX_ATTEMPTS) {
      await db.from('mobile_otps').delete().eq('id', row.id)
      return bad('Too many wrong attempts. Please request a new code.')
    }
    if (!safeEqual(row.otp_hash, await hashOtp(mobile, purpose, code, kind))) {
      await db.from('mobile_otps').update({ attempts: row.attempts + 1 }).eq('id', row.id)
      return bad(`Incorrect code. ${Math.max(MAX_ATTEMPTS - row.attempts - 1, 0)} attempt(s) left.`)
    }
    // single use: only one concurrent request can delete the row
    const del = await db.from('mobile_otps').delete().eq('id', row.id).select('id')
    if (!del.data?.length) return bad('Code already used. Please request a new one.')

    let userId = uid
    if (purpose === 'signup') {
      // auth.users.phone is unique, so only customer accounts carry it; partner accounts keep the mobile in metadata
      const c = await db.auth.admin.createUser({
        email: emailFor(mobile, kind), password, email_confirm: true, ...(kind === 'customer' ? { phone: '91' + mobile, phone_confirm: true } : {}),
        user_metadata: { full_name: fullName.slice(0, 120), mobile, account_kind: kind },
      })
      if (c.error || !c.data.user) { console.error('createUser', c.error?.message); return fail('Could not create your account. Please try again.', 500) }
      userId = c.data.user.id
    } else if (purpose === 'reset') {
      const u = await db.auth.admin.updateUserById(userId!, { password })
      if (u.error) { console.error('reset', u.error.message); return fail('Could not reset the password. Please try again.', 500) }
    }
    const link = await db.auth.admin.generateLink({ type: 'magiclink', email: emailFor(mobile, kind) })
    const th = link.data?.properties?.hashed_token
    if (link.error || !th) { console.error('link', link.error?.message); return fail('Verified, but sign-in failed. Please log in with your password.', 500) }
    await db.from('otp_requests').insert({ phone: mobile, ip, purpose: 'verified_' + purpose, success: true })
    return json({ ok: true, token_hash: th })
  }
  return fail('Invalid action')
})
