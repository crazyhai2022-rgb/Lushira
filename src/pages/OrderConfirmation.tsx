import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, CheckCircle2, Clock, MapPin } from 'lucide-react'
import { getBooking } from '../lib/api'
import { fmtDateTime, inr } from '../lib/format'
import { ErrorState, Skeleton, EmptyState } from '../components/ui'
import { PayBadge, StatusBadge } from '../components/booking'
import { payForBooking } from '../lib/payment'
import { friendlyError } from '../lib/errors'
import { useToast } from '../context/ToastContext'

export default function OrderConfirmation() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const toast = useToast()
  const [paying, setPaying] = useState(false)
  const q = useQuery({ queryKey: ['booking', id], queryFn: () => getBooking(id), refetchInterval: (s) => (s.state.data?.payment_status === 'unpaid' && s.state.data.payment_method === 'razorpay' ? 5000 : false) })
  if (q.isLoading) return <div className="container-x py-10"><Skeleton className="h-80" /></div>
  if (q.isError) return <div className="container-x py-10"><ErrorState onRetry={() => q.refetch()} /></div>
  const b = q.data
  if (!b) return <div className="container-x py-10"><EmptyState title="Booking not found" action={<Link to="/orders" className="btn btn-primary btn-sm">My orders</Link>} /></div>

  const needsPay = b.payment_method === 'razorpay' && b.payment_status !== 'paid' && ['pending', 'confirmed'].includes(b.status) && !['refunded', 'refund_pending'].includes(b.payment_status)
  const pay = async () => {
    setPaying(true)
    try {
      const r = await payForBooking(b.id, { name: b.customer_name, email: b.customer_email ?? undefined, contact: b.customer_phone })
      if (r === 'failed') toast.error('Payment could not be confirmed.')
      await qc.invalidateQueries({ queryKey: ['booking', id] })
    } catch (e) { toast.error(friendlyError(e)) }
    setPaying(false)
  }
  const placed = b.payment_method === 'cash' || b.payment_status === 'paid'

  return (
    <div className="container-x max-w-3xl py-10">
      <div className="text-center">
        <div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ${placed ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}><CheckCircle2 className="h-12 w-12" /></div>
        <h1 className="mt-4 text-3xl font-semibold">{placed ? 'Booking request sent!' : 'Complete your payment'}</h1>
        <p className="mt-1 text-muted">{b.status === 'pending' ? (placed ? 'The salon will confirm your appointment shortly. You will be notified here.' : 'Your slot is held. Pay now to send the request to the salon.') : `Status: ${b.status}`}</p>
        <p className="mt-3 inline-block rounded-full bg-blush-100 px-4 py-1.5 text-sm">Booking ID <strong className="font-mono">{b.reference}</strong></p>
      </div>
      <div className="card mt-6 space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2"><StatusBadge status={b.status} /><PayBadge status={b.payment_status} /></div>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <p className="flex gap-2"><CalendarDays className="h-4 w-4 shrink-0 text-lush-600" />{fmtDateTime(b.scheduled_start)}</p>
          <p className="flex gap-2"><Clock className="h-4 w-4 shrink-0 text-lush-600" />{b.mode === 'home' ? 'At your home' : 'At the salon'}</p>
          <p className="flex gap-2 sm:col-span-2"><MapPin className="h-4 w-4 shrink-0 text-lush-600" />
            {b.mode === 'home' ? [b.address?.line1, b.address?.area, b.address?.city, b.address?.pin_code].filter(Boolean).join(', ') : <>{b.salons?.name} — {[b.salons?.address_line, b.salons?.area, b.salons?.city].filter(Boolean).join(', ')}</>}</p>
        </div>
        <ul className="divide-y divide-line border-y border-line text-sm">
          {b.booking_items?.map((i) => <li key={i.id} className="flex justify-between py-2"><span>{i.name} × {i.quantity}</span><span>{inr(i.price_inr * i.quantity)}</span></li>)}
        </ul>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{inr(b.subtotal_inr)}</dd></div>
          {b.discount_inr > 0 && <div className="flex justify-between text-green-700"><dt>Discount</dt><dd>− {inr(b.discount_inr)}</dd></div>}
          {b.tax_inr > 0 && <div className="flex justify-between text-muted"><dt>Tax</dt><dd>{inr(b.tax_inr)}</dd></div>}
          {b.fee_inr > 0 && <div className="flex justify-between text-muted"><dt>Platform fee</dt><dd>{inr(b.fee_inr)}</dd></div>}
          <div className="flex justify-between text-base font-semibold"><dt>Total</dt><dd>{inr(b.total_inr)}</dd></div>
        </dl>
        {b.payment_method === 'cash' && <p className="rounded-xl bg-blush-100 p-3 text-sm">Pay <strong>{inr(b.total_inr)}</strong> in cash after the service.</p>}
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {needsPay && <button className="btn btn-primary" onClick={pay} disabled={paying}>{paying ? 'Opening…' : `Pay ${inr(b.total_inr)}`}</button>}
        <Link to={`/track/${b.id}`} className="btn btn-primary">Track booking</Link>
        <Link to="/orders" className="btn btn-outline">My orders</Link>
        <Link to="/" className="btn btn-ghost">Back to home</Link>
      </div>
    </div>
  )
}
