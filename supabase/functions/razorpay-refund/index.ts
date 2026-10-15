// Admin-only: approve (and process through Razorpay) or reject a refund request.
import { admin, cors, getUser, json, razorpayCreds } from '../_shared/util.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const user = await getUser(req)
  if (!user) return json({ error: 'Please log in again.' }, 401)
  const db = admin()
  const { data: role } = await db.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle()
  if (!role) return json({ error: 'Forbidden' }, 403)
  const { refund_id, action } = await req.json().catch(() => ({}))
  const { data: r } = await db.from('refunds').select('id,status,amount_inr,payment_id,booking_id,payments(razorpay_payment_id)').eq('id', refund_id).maybeSingle()
  if (!r) return json({ error: 'Refund not found' }, 404)
  if (r.status !== 'requested') return json({ error: 'Refund already handled' }, 409)

  if (action === 'reject') {
    await db.from('refunds').update({ status: 'rejected', reviewed_by: user.id, updated_at: new Date().toISOString() }).eq('id', r.id)
    await db.from('bookings').update({ payment_status: 'paid' }).eq('id', r.booking_id).eq('payment_status', 'refund_pending')
    return json({ ok: true })
  }
  if (action !== 'approve') return json({ error: 'Invalid action' }, 400)
  const rz = razorpayCreds()
  const payId = (r as unknown as { payments: { razorpay_payment_id: string | null } }).payments?.razorpay_payment_id
  if (!rz || !payId) return json({ error: 'Razorpay is not configured or the payment has no gateway ID.' }, 503)

  await db.from('refunds').update({ status: 'processing', reviewed_by: user.id, updated_at: new Date().toISOString() }).eq('id', r.id)
  const res = await fetch(`https://api.razorpay.com/v1/payments/${payId}/refund`, {
    method: 'POST', headers: { Authorization: rz.auth, 'Content-Type': 'application/json', 'X-Refund-Idempotency': r.id },
    body: JSON.stringify({ amount: Math.round(Number(r.amount_inr) * 100), notes: { refund_id: r.id } }),
  })
  const out = await res.json()
  if (!res.ok) {
    console.error('refund error', out)
    await db.from('refunds').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', r.id)
    return json({ error: out?.error?.description ?? 'Razorpay refused the refund.' }, 502)
  }
  await db.from('refunds').update({ razorpay_refund_id: out.id, status: out.status === 'processed' ? 'processed' : 'processing', updated_at: new Date().toISOString() }).eq('id', r.id)
  if (out.status === 'processed') {
    await db.from('payments').update({ status: 'refunded' }).eq('id', r.payment_id)
    await db.from('bookings').update({ payment_status: 'refunded' }).eq('id', r.booking_id)
  }
  return json({ ok: true })
})
