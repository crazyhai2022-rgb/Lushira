import { cors, getUser, hmacHex, json, markPaid, razorpayCreds, safeEqual, admin } from '../_shared/util.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const user = await getUser(req)
  if (!user) return json({ error: 'Please log in again.' }, 401)
  const rz = await razorpayCreds()
  if (!rz) return json({ error: 'Online payments are not configured yet.' }, 503)
  const { booking_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = await req.json().catch(() => ({}))
  if (!booking_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) return json({ error: 'Missing fields' }, 400)

  const { data: b } = await admin().from('bookings').select('customer_id').eq('id', booking_id).maybeSingle()
  if (!b || b.customer_id !== user.id) return json({ error: 'Booking not found.' }, 404)

  const expected = await hmacHex(rz.secret, `${razorpay_order_id}|${razorpay_payment_id}`)
  if (!safeEqual(expected, String(razorpay_signature))) return json({ verified: false, error: 'Signature mismatch' }, 400)
  const ok = await markPaid(booking_id, razorpay_order_id, razorpay_payment_id)
  return json({ verified: ok })
})
