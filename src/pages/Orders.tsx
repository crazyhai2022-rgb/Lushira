import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, ClipboardList, MapPin, RotateCw, Star } from 'lucide-react'
import { getMyBookings } from '../lib/api'
import { supabase, publicUrl } from '../lib/supabase'
import { fmtDateTime, inr } from '../lib/format'
import { CardSkeletonGrid, EmptyState, ErrorState, Modal, PageHero, StarInput } from '../components/ui'
import { ACTIVE, CANCELLABLE, PayBadge, StatusBadge, useCancelBooking } from '../components/booking'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { useToast } from '../context/ToastContext'
import { friendlyError } from '../lib/errors'
import type { Booking } from '../lib/types'

const TABS = [
  { k: 'upcoming', l: 'Upcoming', f: (b: Booking) => ['pending', 'confirmed', 'provider_assigned'].includes(b.status) },
  { k: 'active', l: 'In progress', f: (b: Booking) => ['on_the_way', 'in_progress'].includes(b.status) },
  { k: 'completed', l: 'Completed', f: (b: Booking) => b.status === 'completed' },
  { k: 'cancelled', l: 'Cancelled', f: (b: Booking) => ['cancelled', 'rejected', 'no_show'].includes(b.status) },
] as const

export default function Orders() {
  const { user } = useAuth()
  const nav = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const cart = useCart()
  const [tab, setTab] = useState<(typeof TABS)[number]['k']>('upcoming')
  const [reviewFor, setReviewFor] = useState<Booking | null>(null)
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const cancel = useCancelBooking()
  const q = useQuery({ queryKey: ['bookings'], queryFn: getMyBookings })

  const review = useMutation({
    mutationFn: async () => {
      const r = await supabase.from('reviews').insert({ booking_id: reviewFor!.id, customer_id: user!.id, salon_id: reviewFor!.salon_id, rating, comment: comment.trim() || null })
      if (r.error) throw r.error
    },
    onSuccess: () => { toast.success('Thanks for your review!'); setReviewFor(null); setComment(''); setRating(5); void qc.invalidateQueries({ queryKey: ['bookings'] }) },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const refund = useMutation({
    mutationFn: async (id: string) => { const r = await supabase.rpc('request_refund', { p_booking_id: id, p_reason: 'Customer requested refund' }); if (r.error) throw r.error },
    onSuccess: () => { toast.success('Refund requested. We will update you soon.'); void qc.invalidateQueries({ queryKey: ['bookings'] }) },
    onError: (e) => toast.error(friendlyError(e)),
  })

  const rebook = async (b: Booking) => {
    const ids = (b.booking_items ?? []).map((i) => i.salon_service_id).filter(Boolean) as string[]
    const r = await supabase.from('salon_services').select('id,name,price_inr,duration_min,at_salon,at_home,image_url,is_active').in('id', ids).eq('is_active', true)
    if (r.error || !r.data?.length) return toast.error('These services are no longer available.')
    if (cart.items.length && cart.salon?.id !== b.salon_id && !window.confirm('Replace the services in your cart?')) return
    cart.clear()
    const sal = { id: b.salon_id, name: b.salons?.name ?? '', slug: b.salons?.slug ?? '', homeService: b.mode === 'home', logo: b.salons?.logo_url ?? null }
    r.data.forEach((s) => cart.add(sal, { id: s.id, name: s.name, price: Number(s.price_inr), duration: s.duration_min, atSalon: s.at_salon, atHome: s.at_home, image: s.image_url }, true))
    nav('/cart')
  }

  const list = (q.data ?? []).filter(TABS.find((t) => t.k === tab)!.f)
  return (
    <>
      <PageHero eyebrow="Your bookings" title="My Orders" />
      <div className="container-x py-6">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4" role="tablist">
          {TABS.map((t) => {
            const n = (q.data ?? []).filter(t.f).length
            return <button key={t.k} role="tab" aria-selected={tab === t.k} onClick={() => setTab(t.k)} className={`chip shrink-0 !px-4 !py-2 text-sm ${tab === t.k ? 'chip-active' : ''}`}>{t.l}{n > 0 && ` (${n})`}</button>
          })}
        </div>
        <div className="mt-5 space-y-4">
          {q.isLoading ? <CardSkeletonGrid count={2} className="h-40" /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> :
            list.length === 0 ? <EmptyState icon={<ClipboardList className="h-6 w-6" />} title={`No ${TABS.find((t) => t.k === tab)!.l.toLowerCase()} bookings`} text="When you book a service it will show up here." action={<Link to="/services" className="btn btn-primary btn-sm">Book a service</Link>} /> :
              list.map((b) => (
                <article key={b.id} className="card p-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <img src={publicUrl(b.salons?.logo_url) ?? '/icons/icon-192.png'} alt="" className="h-14 w-14 rounded-xl object-cover" />
                    <div className="min-w-0 flex-1">
                      <Link to={`/salon/${b.salons?.slug}`} className="font-semibold hover:underline">{b.salons?.name}</Link>
                      <p className="text-xs text-muted">#{b.reference}</p>
                      <p className="mt-1 flex items-center gap-1 text-sm"><CalendarDays className="h-4 w-4 text-lush-600" />{fmtDateTime(b.scheduled_start)}</p>
                      <p className="flex items-center gap-1 text-xs text-muted"><MapPin className="h-3.5 w-3.5" />{b.mode === 'home' ? 'At home' : 'At salon'}</p>
                    </div>
                    <div className="text-right"><StatusBadge status={b.status} /><p className="mt-1 font-semibold">{inr(b.total_inr)}</p><PayBadge status={b.payment_status} /></div>
                  </div>
                  <p className="mt-2 text-sm text-muted">{b.booking_items?.map((i) => `${i.name}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`).join(', ')}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link to={`/order/${b.id}`} className="btn btn-outline btn-sm">Details</Link>
                    {ACTIVE.includes(b.status) && <Link to={`/track/${b.id}`} className="btn btn-primary btn-sm">Track</Link>}
                    {CANCELLABLE.includes(b.status) && <button className="btn btn-ghost btn-sm" onClick={() => cancel.ask(b.id)}>Cancel</button>}
                    {['completed', 'cancelled', 'rejected'].includes(b.status) && <button className="btn btn-outline btn-sm" onClick={() => void rebook(b)}><RotateCw className="h-3.5 w-3.5" />Book again</button>}
                    {b.status === 'completed' && !(b.reviews?.length) && <button className="btn btn-dark btn-sm" onClick={() => setReviewFor(b)}><Star className="h-3.5 w-3.5" />Rate</button>}
                    {b.reviews?.[0] && <span className="chip">Rated {b.reviews[0].rating}★</span>}
                    {['cancelled', 'rejected'].includes(b.status) && b.payment_status === 'paid' && <button className="btn btn-ghost btn-sm" onClick={() => refund.mutate(b.id)} disabled={refund.isPending}>Request refund</button>}
                  </div>
                </article>))}
        </div>
      </div>
      {cancel.dialog}
      <Modal open={!!reviewFor} onClose={() => setReviewFor(null)} title={`Rate ${reviewFor?.salons?.name ?? 'your visit'}`}>
        <StarInput value={rating} onChange={setRating} />
        <label className="mt-3 block"><span className="label">Your review (optional)</span><textarea className="input min-h-24" maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} /></label>
        <div className="mt-4 flex justify-end gap-2"><button className="btn btn-ghost" onClick={() => setReviewFor(null)}>Not now</button><button className="btn btn-primary" disabled={review.isPending} onClick={() => review.mutate()}>Submit</button></div>
      </Modal>
    </>
  )
}
