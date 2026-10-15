import { createClient } from 'npm:@supabase/supabase-js@2'

export const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

export const admin = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

/** Returns the authenticated user from the request's JWT, or null. */
export async function getUser(req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data, error } = await admin().auth.getUser(token)
  return error ? null : data.user
}

export function razorpayCreds() {
  const id = Deno.env.get('RAZORPAY_KEY_ID'), secret = Deno.env.get('RAZORPAY_KEY_SECRET')
  return id && secret ? { id, secret, auth: 'Basic ' + btoa(`${id}:${secret}`) } : null
}

const enc = new TextEncoder()
export async function hmacHex(secret: string, data: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

/** Marks a booking's online payment as paid. Idempotent. */
export async function markPaid(bookingId: string, orderId: string, paymentId: string) {
  const db = admin()
  const { data: p } = await db.from('payments').select('id,status,booking_id').eq('booking_id', bookingId).eq('razorpay_order_id', orderId).maybeSingle()
  if (!p) return false
  if (p.status !== 'paid') {
    await db.from('payments').update({ status: 'paid', razorpay_payment_id: paymentId, updated_at: new Date().toISOString() }).eq('id', p.id)
  }
  await db.from('bookings').update({ payment_status: 'paid' }).eq('id', bookingId).in('payment_status', ['unpaid', 'pending', 'failed'])
  const { data: b } = await db.from('bookings').select('reference,salon_id,customer_id,salons(owner_id)').eq('id', bookingId).single()
  if (b && p.status !== 'paid') {
    const owner = (b as unknown as { salons: { owner_id: string } }).salons.owner_id
    await db.from('notifications').insert([
      { user_id: b.customer_id, title: 'Payment received', body: `Payment for booking ${b.reference} was successful.`, kind: 'payment', booking_id: bookingId },
      { user_id: owner, title: 'Booking paid', body: `Booking ${b.reference} is paid and awaiting your confirmation.`, kind: 'partner_booking', booking_id: bookingId },
    ])
  }
  return true
}
