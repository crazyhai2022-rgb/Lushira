import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, PartyPopper } from 'lucide-react'
import { getBooking } from '../lib/api'
import { supabase } from '../lib/supabase'
import { friendlyError } from '../lib/errors'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { EmptyState, ErrorState, Skeleton, Spinner, StarInput } from '../components/ui'
import { inr } from '../lib/format'

/** Dedicated thank-you page shown once the salon marks the service completed. Rating is tied to this verified, completed booking. */
export default function ThankYou() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const q = useQuery({ queryKey: ['booking', id], queryFn: () => getBooking(id) })
  if (q.isLoading) return <div className="container-x py-10"><Skeleton className="h-80" /></div>
  if (q.isError) return <div className="container-x py-10"><ErrorState onRetry={() => q.refetch()} /></div>
  const b = q.data
  if (!b) return <div className="container-x py-10"><EmptyState title="Booking not found" action={<Link to="/orders" className="btn btn-primary btn-sm">My orders</Link>} /></div>
  if (b.status !== 'completed') return <Navigate to={`/track/${id}`} replace />
  const done = b.reviews?.[0]
  const submit = async () => {
    setBusy(true)
    const r = await supabase.from('reviews').insert({ booking_id: b.id, customer_id: user!.id, salon_id: b.salon_id, rating, comment: comment.trim() || null })
    setBusy(false)
    if (r.error) return toast.error(friendlyError(r.error))
    toast.success('Thanks for your review!')
    void qc.invalidateQueries({ queryKey: ['booking', id] }); void qc.invalidateQueries({ queryKey: ['bookings'] })
  }
  return (
    <div className="container-x max-w-lg py-10">
      <section className="card overflow-hidden text-center">
        <div className="bg-gradient-to-r from-lush-600 to-plum-700 px-5 py-8 text-white">
          <PartyPopper className="mx-auto h-12 w-12" />
          <h1 className="mt-3 font-display text-3xl font-semibold">Thank you!</h1>
          <p className="mt-1 text-sm opacity-90">Your service with {b.salons?.name} is complete.</p>
        </div>
        <div className="space-y-4 p-5">
          <p className="text-sm text-muted">Booking #{b.reference} · {inr(b.total_inr)} · {b.payment_method === 'cash' ? 'Paid in cash' : 'Paid online'}</p>
          {done ? (
            <p className="rounded-xl bg-blush-100 p-4 font-medium">You rated this service {done.rating}★. Thank you for your feedback!</p>
          ) : (
            <div className="space-y-3 text-left">
              <p className="text-center font-semibold">How was your service?</p>
              <div className="flex justify-center"><StarInput value={rating} onChange={setRating} /></div>
              <textarea className="input min-h-24" maxLength={1000} placeholder="Share your experience (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
              <p className="flex items-center justify-center gap-1 text-xs text-muted"><BadgeCheck className="h-4 w-4 text-sky-500" />Verified booking — only customers with a completed service can review.</p>
              <button className="btn btn-primary w-full" disabled={busy} onClick={() => void submit()}>{busy ? <Spinner /> : 'Submit rating & review'}</button>
            </div>)}
          <div className="flex flex-wrap justify-center gap-2"><Link to="/orders" className="btn btn-outline btn-sm">My orders</Link><Link to="/" className="btn btn-ghost btn-sm">Back to home</Link></div>
        </div>
      </section>
    </div>
  )
}
