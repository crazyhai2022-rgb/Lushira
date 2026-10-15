import { admin, cors, getUser, json, razorpayCreds } from '../_shared/util.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const user = await getUser(req)
  if (!user) return json({ error: 'Please log in again.' }, 401)
  const rz = await razorpayCreds()
  if (!rz) return json({ error: 'Online payments are not configured yet.' }, 503)
  const { booking_id } = await req.json().catch(() => ({}))
  if (!booking_id) return json({ error: 'booking_id required' }, 400)

  const db = admin()
  const { data: b } = await db.from('bookings').select('id,reference,total_inr,status,payment_method,payment_status,customer_id').eq('id', booking_id).maybeSingle()
  if (!b || b.customer_id !== user.id) return json({ error: 'Booking not found.' }, 404)
  if (b.payment_method !== 'razorpay' || b.status !== 'pending' || !['unpaid', 'pending', 'failed'].includes(b.payment_status)) return json({ error: 'This booking cannot be paid online.' }, 409)

  const amount = Math.round(Number(b.total_inr) * 100)
  const { data: pay } = await db.from('payments').select('id,razorpay_order_id,amount_inr').eq('booking_id', b.id).eq('method', 'razorpay').order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (pay?.razorpay_order_id && Math.round(Number(pay.amount_inr) * 100) === amount) {
    return json({ order_id: pay.razorpay_order_id, amount, currency: 'INR', key_id: rz.id })
  }
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST', headers: { Authorization: rz.auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, currency: 'INR', receipt: b.reference, notes: { booking_id: b.id } }),
  })
  const order = await res.json()
  if (!res.ok) { console.error('razorpay order error', order); return json({ error: 'Could not start payment. Please try again.' }, 502) }
  if (pay) await db.from('payments').update({ razorpay_order_id: order.id, status: 'pending' }).eq('id', pay.id)
  else await db.from('payments').insert({ booking_id: b.id, method: 'razorpay', amount_inr: b.total_inr, status: 'pending', razorpay_order_id: order.id })
  return json({ order_id: order.id, amount, currency: 'INR', key_id: rz.id })
})
