import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, MapPin, Navigation, Phone } from 'lucide-react'
import { getBooking, getMyBookings } from '../lib/api'
import { supabase } from '../lib/supabase'
import { fmtDateTime, fmtTime, inr } from '../lib/format'
import { EmptyState, ErrorState, PageHero, Skeleton } from '../components/ui'
import { ACTIVE, CANCELLABLE, PayBadge, StatusBadge, useCancelBooking } from '../components/booking'
import MapView, { type MapMarker } from '../components/MapView'
import type { BookingStatus } from '../lib/types'

const HOME_FLOW: BookingStatus[] = ['pending', 'confirmed', 'provider_assigned', 'on_the_way', 'in_progress', 'completed']
const SALON_FLOW: BookingStatus[] = ['pending', 'confirmed', 'in_progress', 'completed']
const STEP_LABEL: Record<string, string> = {
  pending: 'Booking placed', confirmed: 'Confirmed by salon', provider_assigned: 'Beautician assigned', on_the_way: 'On the way', in_progress: 'Service in progress', completed: 'Completed',
}

export function TrackList() {
  const q = useQuery({ queryKey: ['bookings'], queryFn: getMyBookings })
  const active = (q.data ?? []).filter((b) => ACTIVE.includes(b.status))
  return (
    <>
      <PageHero eyebrow="Live status" title="Track your booking" />
      <div className="container-x py-6">
        {q.isLoading ? <Skeleton className="h-32" /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : active.length === 0 ? (
          <EmptyState icon={<Navigation className="h-6 w-6" />} title="Nothing to track right now" text="Active bookings appear here with live status updates." action={<Link to="/orders" className="btn btn-primary btn-sm">View all orders</Link>} />
        ) : (
          <div className="space-y-3">{active.map((b) => (
            <Link key={b.id} to={`/track/${b.id}`} className="card flex items-center justify-between gap-3 p-4 hover:shadow-md">
              <div><p className="font-semibold">{b.salons?.name}</p><p className="text-sm text-muted">{fmtDateTime(b.scheduled_start)} · #{b.reference}</p></div><StatusBadge status={b.status} />
            </Link>))}</div>)}
      </div>
    </>
  )
}

interface Loc { lat: number; lng: number; recorded_at: string }

export default function Tracking() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const cancel = useCancelBooking()
  const [loc, setLoc] = useState<Loc | null>(null)
  const bq = useQuery({ queryKey: ['booking', id], queryFn: () => getBooking(id) })
  const hist = useQuery({
    queryKey: ['history', id],
    queryFn: async () => {
      const r = await supabase.from('booking_status_history').select('status,created_at').eq('booking_id', id).order('created_at')
      if (r.error) throw r.error
      return (r.data ?? []) as { status: BookingStatus; created_at: string }[]
    },
  })
  const contact = useQuery({
    queryKey: ['contact', id],
    queryFn: async () => { const r = await supabase.rpc('get_booking_contact', { p_booking_id: id }); if (r.error) throw r.error; return r.data as { salon_name: string; salon_phone: string | null; provider_name: string | null; salon_lat: number | null; salon_lng: number | null; salon_address: string } },
  })
  const b = bq.data
  const trackable = !!b && b.mode === 'home' && ['provider_assigned', 'on_the_way', 'in_progress'].includes(b.status)

  useEffect(() => {
    const ch = supabase.channel(`track-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `id=eq.${id}` }, () => { void qc.invalidateQueries({ queryKey: ['booking', id] }); void qc.invalidateQueries({ queryKey: ['history', id] }) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'provider_locations', filter: `booking_id=eq.${id}` }, (p) => {
        const n = p.new as Partial<Loc> | undefined
        if (n && typeof n.lat === 'number' && typeof n.lng === 'number') setLoc({ lat: n.lat, lng: n.lng, recorded_at: n.recorded_at ?? new Date().toISOString() })
      })
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [id, qc])

  useEffect(() => {
    if (!trackable) { setLoc(null); return }
    void supabase.from('provider_locations').select('lat,lng,recorded_at').eq('booking_id', id).maybeSingle().then((r) => { if (r.data && r.data.lat != null) setLoc(r.data as Loc) })
  }, [id, trackable])

  if (bq.isLoading) return <div className="container-x py-8"><Skeleton className="h-96" /></div>
  if (bq.isError) return <div className="container-x py-8"><ErrorState onRetry={() => bq.refetch()} /></div>
  if (!b) return <div className="container-x py-8"><EmptyState title="Booking not found" action={<Link to="/orders" className="btn btn-primary btn-sm">My orders</Link>} /></div>

  const flow = b.mode === 'home' ? HOME_FLOW : SALON_FLOW
  const ended = ['cancelled', 'rejected', 'no_show'].includes(b.status)
  const idx = flow.indexOf(b.status)
  const at = (s: BookingStatus) => hist.data?.find((h) => h.status === s)?.created_at
  const salonLat = contact.data?.salon_lat ?? b.salons?.lat ?? null
  const salonLng = contact.data?.salon_lng ?? b.salons?.lng ?? null
  const destLat = b.address?.lat, destLng = b.address?.lng

  const markers: MapMarker[] = []
  let center: [number, number] | null = null
  if (b.mode === 'home') {
    if (destLat != null && destLng != null) { markers.push({ id: 'dest', lat: destLat, lng: destLng, label: 'Your location', kind: 'home' }); center = [destLat, destLng] }
    if (trackable && loc) { markers.push({ id: 'prov', lat: loc.lat, lng: loc.lng, label: contact.data?.provider_name ?? 'Beautician', sub: `Updated ${fmtTime(loc.recorded_at)}`, kind: 'provider' }) }
  } else if (salonLat != null && salonLng != null) {
    markers.push({ id: 'salon', lat: salonLat, lng: salonLng, label: b.salons?.name ?? 'Salon' }); center = [salonLat, salonLng]
  }
  const km = loc && destLat != null && destLng != null ? haversine(loc.lat, loc.lng, destLat, destLng) : null
  const stale = loc ? Date.now() - new Date(loc.recorded_at).getTime() > 3 * 60_000 : false

  return (
    <div className="container-x max-w-4xl py-8">
      <Link to="/orders" className="text-sm text-lush-600 hover:underline">← My orders</Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-semibold sm:text-3xl">{b.salons?.name}</h1><p className="text-sm text-muted">#{b.reference} · {fmtDateTime(b.scheduled_start)}</p></div>
        <div className="flex gap-2"><StatusBadge status={b.status} /><PayBadge status={b.payment_status} /></div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_1.2fr]">
        <section className="card p-5" aria-label="Status timeline">
          {ended ? (
            <div><StatusBadge status={b.status} /><p className="mt-2 text-sm text-muted">{b.cancel_reason ? `Reason: ${b.cancel_reason}` : 'This booking is closed.'}</p>
              {b.payment_status === 'paid' && <p className="mt-2 text-sm">Your payment of {inr(b.total_inr)} is eligible for a refund per our policy. <Link to="/orders" className="font-semibold text-lush-600">Request from My Orders</Link>.</p>}</div>
          ) : (
            <ol className="relative space-y-5">
              {flow.map((s, i) => {
                const done = idx >= i
                return (
                  <li key={s} className="flex gap-3">
                    <span className={`z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${done ? 'border-lush-600 bg-lush-600 text-white' : 'border-blush-300 bg-white'} ${i === idx ? 'ring-4 ring-lush-400/25' : ''}`}>{done && <Check className="h-3.5 w-3.5" />}</span>
                    <div><p className={`text-sm font-medium ${done ? '' : 'text-muted'}`}>{STEP_LABEL[s]}</p>{at(s) && <p className="text-xs text-muted">{fmtDateTime(at(s)!)}</p>}</div>
                  </li>)
              })}
            </ol>)}
        </section>

        <section className="space-y-3">
          {center ? (
            <>
              <MapView center={center} markers={markers} height={280} zoom={15} />
              {b.mode === 'home' && trackable && !loc && <p className="rounded-xl bg-blush-100 p-3 text-sm text-muted">Live location will appear here once your beautician starts sharing it.</p>}
              {b.mode === 'home' && loc && <p className="text-sm">{km != null && <>About <strong>{km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`}</strong> away (straight line). </>}{stale && <span className="text-amber-700">Location last updated {fmtTime(loc.recorded_at)}.</span>}</p>}
              {b.mode === 'salon' && salonLat != null && <a className="btn btn-outline btn-sm" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${salonLat},${salonLng}`}><Navigation className="h-4 w-4" />Get directions</a>}
            </>
          ) : <div className="card p-5 text-sm text-muted"><MapPin className="mb-1 h-5 w-5 text-lush-600" />Map is not available for this booking.</div>}
          <div className="card space-y-2 p-4 text-sm">
            <p className="font-semibold">Contact</p>
            {contact.data?.provider_name && <p>Your beautician: {contact.data.provider_name}</p>}
            {contact.data?.salon_phone ? <a className="btn btn-primary btn-sm" href={`tel:${contact.data.salon_phone}`}><Phone className="h-4 w-4" />Call {contact.data.salon_name}</a> : <p className="text-muted">Salon contact number not available.</p>}
            {CANCELLABLE.includes(b.status) && <button className="btn btn-ghost btn-sm" onClick={() => cancel.ask(b.id)}>Cancel booking</button>}
          </div>
        </section>
      </div>
      {cancel.dialog}
    </div>
  )
}

function haversine(a: number, b: number, c: number, d: number) {
  const R = 6371, r = (x: number) => (x * Math.PI) / 180
  const dLat = r(c - a), dLng = r(d - b)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
