import { supabase } from './supabase'

export type OtpPurpose = 'signup' | 'login' | 'reset'
export type AccountKind = 'customer' | 'partner'
const DOMAINS: Record<AccountKind, string> = { customer: 'phone.lushira.app', partner: 'partner.lushira.app' }

/** 10-digit Indian mobile (no +91 / 0). Returns null when invalid. */
export function cleanMobile(raw: string): string | null {
  let d = raw.replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2)
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  return /^[6-9]\d{9}$/.test(d) ? d : null
}
export const mobileEmail = (m: string, kind: AccountKind = 'customer') => `${m}@${DOMAINS[kind]}`
/** Internal mobile-login address is never shown as a real email. */
export const realEmail = (email?: string | null) => (email && !Object.values(DOMAINS).some((d) => email.endsWith('@' + d)) ? email : '')

async function call(body: Record<string, unknown>) {
  const r = await supabase.functions.invoke('mobile-auth', { body })
  let data = r.data as { ok?: boolean; error?: string; token_hash?: string; cooldown?: number } | null
  if (r.error && !data) {
    try { data = await (r.error as unknown as { context: Response }).context.json() } catch { /* ignore */ }
  }
  if (!data?.ok) throw new Error(data?.error || 'Something went wrong. Please try again.')
  return data
}

export async function sendMobileOtp(mobile: string, purpose: OtpPurpose, kind: AccountKind = 'customer') {
  const d = await call({ action: 'send', mobile, purpose, kind })
  return d.cooldown ?? 45
}

/** Verifies the OTP on the server, then signs in with the one-time token it returns. */
export async function verifyMobileOtp(p: { mobile: string; purpose: OtpPurpose; code: string; full_name?: string; password?: string; kind?: AccountKind }) {
  const d = await call({ action: 'verify', ...p, kind: p.kind ?? 'customer' })
  const r = await supabase.auth.verifyOtp({ token_hash: d.token_hash!, type: 'magiclink' })
  if (r.error) throw new Error('Verified, but sign-in failed. Please log in with your password.')
}

export async function loginWithMobilePassword(mobile: string, password: string, kind: AccountKind = 'customer') {
  const r = await supabase.auth.signInWithPassword({ email: mobileEmail(mobile, kind), password })
  if (r.error) throw new Error(/invalid login/i.test(r.error.message) ? 'Incorrect mobile number or password.' : r.error.message)
}
