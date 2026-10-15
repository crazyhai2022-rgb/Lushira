import { supabase, env } from './supabase'

declare global {
  interface Window { Razorpay?: new (opts: Record<string, unknown>) => { open: () => void; on: (ev: string, cb: (r: unknown) => void) => void } }
}

let scriptPromise: Promise<void> | null = null
function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve()
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => { scriptPromise = null; reject(new Error('Could not load the payment window. Check your connection.')) }
    document.head.appendChild(s)
  })
  return scriptPromise
}

export type PayResult = 'paid' | 'dismissed' | 'failed'

/**
 * Starts a Razorpay payment for an existing unpaid booking.
 * The order is created on the server, the amount comes from the database, and the
 * payment is only marked paid after the server verifies the signature.
 */
export async function payForBooking(bookingId: string, prefill: { name?: string; email?: string; contact?: string }): Promise<PayResult> {
  const created = await supabase.functions.invoke('razorpay-create-order', { body: { booking_id: bookingId } })
  if (created.error || !created.data?.order_id) {
    throw new Error(created.data?.error || 'Online payment is not available right now. Please try again or contact support.')
  }
  const order = created.data as { order_id: string; amount: number; currency: string; key_id: string }
  await loadCheckout()
  return new Promise<PayResult>((resolve) => {
    const rzp = new window.Razorpay!({
      key: order.key_id || env.razorpayKeyId,
      order_id: order.order_id,
      amount: order.amount,
      currency: order.currency,
      name: 'Lushira',
      description: 'Beauty service booking',
      prefill,
      theme: { color: '#c4416f' },
      modal: { ondismiss: () => resolve('dismissed') },
      handler: async (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        const v = await supabase.functions.invoke('razorpay-verify', { body: { booking_id: bookingId, ...resp } })
        resolve(v.error || !v.data?.verified ? 'failed' : 'paid')
      },
    })
    rzp.on('payment.failed', () => resolve('failed'))
    rzp.open()
  })
}
