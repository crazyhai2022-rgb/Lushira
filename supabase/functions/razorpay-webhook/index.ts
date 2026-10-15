// Razorpay -> Lushira. Configure in Razorpay Dashboard: events payment.captured, order.paid, payment.failed, refund.processed, refund.failed
import { admin, hmacHex, json, markPaid, safeEqual } from '../_shared/util.ts'

Deno.serve(async (req) => {
  const secret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET')
  if (!secret) return json({ error: 'not configured' }, 503)
  const raw = await req.text()
  const sig = req.headers.get('x-razorpay-signature') ?? ''
  if (!safeEqual(await hmacHex(secret, raw), sig)) return json({ error: 'bad signature' }, 401)

  const eventId = req.headers.get('x-razorpay-event-id') ?? ''
  const evt = JSON.parse(raw)
  const db = admin()
  if (eventId) {
    const ins = await db.from('webhook_events').insert({ event_id: eventId, event_type: evt.event, payload: evt })
    if (ins.error) { // duplicate delivery -> already handled
      if (ins.error.code === '23505') return json({ ok: true, duplicate: true })
      console.error(ins.error); return json({ error: 'store failed' }, 500)
    }
  }
  try {
    const pay = evt.payload?.payment?.entity
    switch (evt.event) {
      case 'payment.captured':
      case 'order.paid': {
        const p = pay ?? evt.payload?.order?.entity
        const orderId = pay?.order_id ?? p?.id
        const paymentId = pay?.id ?? ''
        const { data: row } = await db.from('payments').select('booking_id').eq('razorpay_order_id', orderId).maybeSingle()
        if (row) await markPaid(row.booking_id, orderId, paymentId)
        break
      }
      case 'payment.failed': {
        const { data: row } = await db.from('payments').select('id,status,booking_id').eq('razorpay_order_id', pay?.order_id).maybeSingle()
        if (row && row.status === 'pending') await db.from('payments').update({ status: 'failed', failure_reason: pay?.error_description ?? 'failed' }).eq('id', row.id)
        break
      }
      case 'refund.processed':
      case 'refund.failed': {
        const rf = evt.payload?.refund?.entity
        const ok = evt.event === 'refund.processed'
        const { data: r } = await db.from('refunds').update({ status: ok ? 'processed' : 'failed', updated_at: new Date().toISOString() }).eq('razorpay_refund_id', rf?.id).select('booking_id,payment_id').maybeSingle()
        if (r && ok) {
          await db.from('payments').update({ status: 'refunded' }).eq('id', r.payment_id)
          await db.from('bookings').update({ payment_status: 'refunded' }).eq('id', r.booking_id)
        }
        break
      }
    }
    await db.from('webhook_events').update({ processed_at: new Date().toISOString() }).eq('event_id', eventId)
  } catch (e) { console.error('webhook handler', e); return json({ error: 'handler failed' }, 500) }
  return json({ ok: true })
})
