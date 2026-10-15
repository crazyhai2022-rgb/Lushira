import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Banknote, Bell, BellOff, BellRing, CalendarClock, CalendarDays, Check, IndianRupee, MapPin, Navigation, Phone, Radio, X } from 'lucide-react'
import { useMySalon } from './PartnerRegister'
import { BOOKING_SELECT } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { friendlyError } from '../../lib/errors'
import { fmtDateTime, fmtTime, inr, istDate } from '../../lib/format'
import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../../context/ToastContext'
import { EmptyState, ErrorState, PageHero, Skeleton } from '../../components/ui'
import { PayBadge, StatusBadge } from '../../components/booking'
import BookingChat, { CHAT_STATUSES, ChatButton, useChatDelivery } from '../../components/BookingChat'
import { playRing, useOrderRing, useRingSetting } from '../../lib/ring'
import { BrandsEditor, HoursEditor, PhotosEditor, ServicesEditor, StaffEditor } from './editors'
import type { Booking, BookingStatus, Salon } from '../../lib/types'

type Tab = 'bookings' | 'overview' | 'services' | 'hours' | 'photos' | 'staff' | 'brands' | 'reports' | 'account'
const TABS: [Tab, string][] = [['bookings', 'Orders'], ['overview', 'Overview'], ['services', 'Services'], ['hours', 'Hours'], ['photos', 'Photos'], ['staff', 'Staff'], ['brands', 'Brands'], ['reports', 'Reports'], ['account', 'Account']]

export default function PartnerDashboard() {
  const salonQ = useMySalon()
  const [tab, setTab] = useState<Tab>('bookings')
  const qc = useQueryClient()
  useChatDelivery()
  const salon = salonQ.data
  if (salonQ.isLoading) return <div className="container-x py-10"><Skeleton className="h-64" /></div>
  if (salonQ.isError) return <div className="container-x py-10"><ErrorState onRetry={() => salonQ.refetch()} /></div>
  if (!salon) return <div className="container-x py-12"><EmptyState title="No salon yet" text="Register your salon to start receiving bookings." action={<Link to="/partner/register" className="btn btn-primary btn-sm">Register salon</Link>} /></div>
  return (
    <>
      <PageHero eyebrow="Partner portal" title={salon.name} subtitle={[salon.area, salon.city].filter(Boolean).join(', ')} />
      <div className="container-x py-5">
        {salon.status !== 'approved' && <StatusBanner salon={salon} />}
        <OrderAlert salon={salon} open={() => setTab('bookings')} />
        <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4" role="tablist">
          {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`chip shrink-0 !px-4 !py-2 text-sm ${tab === k ? 'chip-active' : ''}`}>{l}</button>)}
        </div>
        {tab === 'overview' && <Overview salon={salon} go={setTab} />}
        {tab === 'bookings' && <Bookings salon={salon} />}
        {tab === 'services' && <ServicesEditor salonId={salon.id} homeService={salon.home_service} />}
        {tab === 'hours' && <HoursEditor salonId={salon.id} />}
        {tab === 'photos' && <PhotosEditor salonId={salon.id} logo={salon.logo_url} cover={salon.cover_url} onChanged={() => void qc.invalidateQueries({ queryKey: ['my-salon'] })} />}
        {tab === 'staff' && <StaffEditor salonId={salon.id} />}
        {tab === 'brands' && <BrandsEditor salonId={salon.id} />}
        {tab === 'reports' && <Reports salon={salon} />}
        {tab === 'account' && <Account salon={salon} />}
      </div>
    </>
  )
}


/** New-order ring: rings until every new request is accepted/rejected. Partner can switch it on/off. */
function OrderAlert({ salon, open }: { salon: Salon; open: () => void }) {
  const q = useSalonBookings(salon.id)
  const [on, setOn] = useRingSetting()
  const pending = (q.data ?? []).filter((b) => b.status === 'pending' && !(b.payment_method === 'razorpay' && b.payment_status !== 'paid')).length
  const { blocked } = useOrderRing(pending > 0, on)
  return (
    <div className="mb-4 space-y-2">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white p-3">
        <div className="flex items-center gap-2 text-sm">{on ? <BellRing className="h-5 w-5 text-lush-600" /> : <BellOff className="h-5 w-5 text-muted" />}<span className="font-medium">New order ring</span><span className={`chip ${on ? 'bg-green-100 text-green-800' : ''}`}>{on ? 'ON' : 'OFF'}</span></div>
        <div className="flex items-center gap-2">
          {on && <button type="button" className="btn btn-ghost btn-sm" onClick={playRing}>Test</button>}
          <button type="button" role="switch" aria-checked={on} aria-label="Order ring on or off" onClick={() => { setOn(!on); if (!on) playRing() }}
            className={`relative h-7 w-12 rounded-full transition ${on ? 'bg-lush-600' : 'bg-blush-300'}`}><span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} /></button>
        </div>
      </div>
      {pending > 0 && (
        <button type="button" onClick={open} className="flex w-full items-center justify-between gap-3 rounded-xl bg-gradient-to-r from-lush-600 to-plum-700 p-3 text-left text-white shadow-lg">
          <span className="flex items-center gap-2 font-semibold"><BellRing className="h-5 w-5 animate-pulse" />{pending} new booking request{pending > 1 ? 's' : ''}!</span><span className="text-sm underline">View &amp; accept</span>
        </button>)}
      {pending > 0 && on && blocked && <p className="text-xs text-amber-700">Tap anywhere on the screen once so your phone allows the ring sound.</p>}
    </div>
  )
}

function StatusBanner({ salon }: { salon: Salon }) {
  const m: Record<string, string> = { draft: 'Your application is not submitted yet. Finish registration to go live.', pending: 'Your salon is under review. You will be notified once it is approved. Customers cannot book yet.', rejected: `Your application needs changes: ${salon.rejection_reason ?? ''}`, suspended: `Your salon is suspended. ${salon.rejection_reason ?? 'Contact support.'}` }
  return <div role="status" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900"><span>{m[salon.status]}</span>{['draft', 'rejected'].includes(salon.status) && <Link to="/partner/register" className="btn btn-primary btn-sm">Continue registration</Link>}</div>
}

function useSalonBookings(salonId: string) {
  const qc = useQueryClient()
  useEffect(() => {
    const ch = supabase.channel(`pb-${salonId}-${Math.random().toString(36).slice(2, 8)}`).on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `salon_id=eq.${salonId}` }, () => void qc.invalidateQueries({ queryKey: ['p-bookings', salonId] })).subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [salonId, qc])
  return useQuery({
    queryKey: ['p-bookings', salonId],
    queryFn: async () => { const r = await supabase.from('bookings').select(BOOKING_SELECT).eq('salon_id', salonId).order('scheduled_start', { ascending: false }).limit(300); if (r.error) throw r.error; return r.data as unknown as Booking[] },
  })
}

function Overview({ salon, go }: { salon: Salon; go: (t: Tab) => void }) {
  const { user } = useAuth()
  const q = useSalonBookings(salon.id)
  const notes = useQuery({ queryKey: ['p-notes', user?.id], queryFn: async () => { const r = await supabase.from('notifications').select('id,title,body,created_at').order('created_at', { ascending: false }).limit(8); return r.data ?? [] } })
  const s = useMemo(() => {
    const d = q.data ?? [], today = istDate(0), month = today.slice(0, 7)
    const ist = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(iso))
    return {
      pending: d.filter((b) => b.status === 'pending' && !(b.payment_method === 'razorpay' && b.payment_status !== 'paid')).length,
      today: d.filter((b) => ist(b.scheduled_start) === today && !['cancelled', 'rejected'].includes(b.status)).length,
      done: d.filter((b) => b.status === 'completed' && ist(b.scheduled_start).startsWith(month)).length,
      revenue: d.filter((b) => b.status === 'completed' && ist(b.scheduled_start).startsWith(month)).reduce((a, b) => a + Number(b.total_inr), 0),
    }
  }, [q.data])
  const stats = [[Bell, 'New requests', s.pending, 'bookings'], [CalendarClock, "Today's bookings", s.today, 'bookings'], [Check, 'Completed this month', s.done, 'reports'], [IndianRupee, 'Revenue this month', inr(s.revenue), 'reports']] as const
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{stats.map(([I, l, v, to]) => <button key={l} onClick={() => go(to as Tab)} className="card p-4 text-left hover:shadow-md"><I className="h-5 w-5 text-lush-600" /><p className="mt-2 font-display text-2xl font-semibold">{q.isLoading ? '…' : v}</p><p className="text-xs text-muted">{l}</p></button>)}</div>
      <section><h3 className="mb-2 font-display text-lg font-semibold">Recent notifications</h3>
        {notes.data?.length ? <ul className="space-y-2">{notes.data.map((n) => <li key={n.id} className="card p-3 text-sm"><p className="font-medium">{n.title}</p><p className="text-muted">{n.body}</p><p className="text-xs text-muted">{fmtDateTime(n.created_at)}</p></li>)}</ul> : <p className="text-sm text-muted">No notifications yet.</p>}</section>
    </div>
  )
}

const FLOW_HOME: BookingStatus[] = ['confirmed', 'provider_assigned', 'on_the_way', 'in_progress', 'completed']
const FLOW_SALON: BookingStatus[] = ['confirmed', 'in_progress', 'completed']
const FLOW_LABEL: Record<string, string> = { confirmed: 'Accepted', provider_assigned: 'Assigned', on_the_way: 'On the way', in_progress: 'In service', completed: 'Done' }
/** The one main button that moves an order to its next step. */
function nextStep(b: Booking): { to: BookingStatus; label: string } | null {
  const home = b.mode === 'home'
  if (b.status === 'confirmed') return home ? { to: 'provider_assigned', label: 'Beautician assigned' } : { to: 'in_progress', label: 'Start service' }
  if (b.status === 'provider_assigned') return { to: 'on_the_way', label: "I'm on the way" }
  if (b.status === 'on_the_way') return { to: 'in_progress', label: 'Start service' }
  if (b.status === 'in_progress') return { to: 'completed', label: 'Mark completed' }
  return null
}

function Bookings({ salon }: { salon: Salon }) {
  const toast = useToast()
  const qc = useQueryClient()
  const [f, setF] = useState<'new' | 'upcoming' | 'past'>('new')
  const [chat, setChat] = useState<{ id: string; title: string; phone: string } | null>(null)
  const q = useSalonBookings(salon.id)
  const staff = useQuery({ queryKey: ['p-staff-act', salon.id], queryFn: async () => { const r = await supabase.from('salon_staff').select('id,name').eq('salon_id', salon.id).eq('is_active', true); return r.data ?? [] } })
  const act = useMutation({
    mutationFn: async (p: { id: string; patch: Record<string, unknown> }) => { const r = await supabase.from('bookings').update(p.patch).eq('id', p.id).select('id,status').single(); if (r.error) throw r.error; if (p.patch.status && r.data.status !== p.patch.status) throw new Error('That status change is not allowed right now.') },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['p-bookings', salon.id] }), onError: (e) => toast.error(friendlyError(e)),
  })
  const cash = useMutation({
    mutationFn: async (id: string) => { const r = await supabase.rpc('mark_cash_collected', { p_booking_id: id }); if (r.error) throw r.error },
    onSuccess: () => { toast.success('Cash payment recorded.'); void qc.invalidateQueries({ queryKey: ['p-bookings', salon.id] }) }, onError: (e) => toast.error(friendlyError(e)),
  })
  const list = (q.data ?? []).filter((b) => f === 'new' ? b.status === 'pending' : f === 'upcoming' ? ['confirmed', 'provider_assigned', 'on_the_way', 'in_progress'].includes(b.status) : ['completed', 'cancelled', 'rejected', 'no_show'].includes(b.status))
  return (
    <div>
      <div className="mb-4 flex gap-2">{(['new', 'upcoming', 'past'] as const).map((k) => <button key={k} onClick={() => setF(k)} className={`chip !px-4 !py-2 text-sm capitalize ${f === k ? 'chip-active' : ''}`}>{k === 'new' ? 'New requests' : k}</button>)}</div>
      {q.isLoading ? <Skeleton className="h-32" /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : !list.length ? <EmptyState icon={<CalendarDays className="h-6 w-6" />} title="Nothing here" text="Bookings will appear as customers book your services." /> : (
        <div className="space-y-3">{list.map((b) => {
          const awaitingPay = b.payment_method === 'razorpay' && b.payment_status !== 'paid'
          return (
            <article key={b.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><p className="font-semibold">{b.customer_name} <span className="text-xs font-normal text-muted">#{b.reference}</span></p>
                  <p className="text-sm">{fmtDateTime(b.scheduled_start)} – {fmtTime(b.scheduled_end)}</p>
                  <p className="text-xs text-muted">{b.mode === 'home' ? 'At customer home' : 'At salon'} · {b.booking_items?.map((i) => `${i.name}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`).join(', ')}</p></div>
                <div className="text-right"><StatusBadge status={b.status} /><p className="mt-1 font-semibold">{inr(b.total_inr)}</p><PayBadge status={b.payment_status} /></div>
              </div>
              {['pending', 'confirmed', 'provider_assigned', 'on_the_way', 'in_progress'].includes(b.status) && (
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                  <a className="inline-flex items-center gap-1 text-lush-600" href={`tel:${b.customer_phone}`}><Phone className="h-4 w-4" />{b.customer_phone}</a>
                  {b.mode === 'home' && b.address && <a className="inline-flex items-center gap-1 text-lush-600" target="_blank" rel="noopener noreferrer" href={b.address.lat != null ? `https://www.google.com/maps/dir/?api=1&destination=${b.address.lat},${b.address.lng}` : '#'}><MapPin className="h-4 w-4" />{[b.address.line1, b.address.area, b.address.pin_code].filter(Boolean).join(', ')}</a>}
                </div>)}
              {['confirmed', 'provider_assigned', 'on_the_way', 'in_progress', 'completed'].includes(b.status) && (
                <ol className="mt-3 flex items-center gap-1 overflow-x-auto text-[11px]" aria-label="Order progress">
                  {(b.mode === 'home' ? FLOW_HOME : FLOW_SALON).map((st, i, arr) => { const cur = arr.indexOf(b.status); return (
                    <li key={st} className="flex items-center gap-1"><span className={`whitespace-nowrap rounded-full px-2.5 py-1 font-medium ${i < cur ? 'bg-green-100 text-green-800' : i === cur ? 'bg-lush-600 text-white' : 'bg-blush-100 text-muted'}`}>{i < cur ? '✓ ' : ''}{FLOW_LABEL[st]}</span>{i < arr.length - 1 && <span className="text-muted">›</span>}</li>) })}
                </ol>)}
              {b.notes && <p className="mt-2 rounded-lg bg-blush-50 p-2 text-xs text-muted">Note: {b.notes}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {b.status === 'pending' && (awaitingPay ? <span className="chip bg-amber-100 text-amber-800">Awaiting customer payment</span> : <>
                  <button className="btn btn-primary btn-sm" disabled={act.isPending} onClick={() => act.mutate({ id: b.id, patch: { status: 'confirmed' } })}><Check className="h-4 w-4" />Accept</button>
                  <button className="btn btn-outline btn-sm" disabled={act.isPending} onClick={() => { if (window.confirm('Reject this booking?')) act.mutate({ id: b.id, patch: { status: 'rejected' } }) }}><X className="h-4 w-4" />Reject</button></>)}
                {b.status === 'confirmed' && b.mode === 'home' && (staff.data?.length ?? 0) > 0 && (
                  <select className="input !w-auto !py-1.5 text-xs" aria-label="Assign beautician" value={b.staff_id ?? ''} onChange={(e) => e.target.value && act.mutate({ id: b.id, patch: { staff_id: e.target.value, status: 'provider_assigned' } })}><option value="">Assign beautician…</option>{staff.data!.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>)}
                {nextStep(b) && <button className="btn btn-primary btn-sm" disabled={act.isPending} onClick={() => act.mutate({ id: b.id, patch: { status: nextStep(b)!.to } })}><Check className="h-4 w-4" />{nextStep(b)!.label}</button>}
                {['confirmed', 'provider_assigned', 'on_the_way'].includes(b.status) && <button className="btn btn-ghost btn-sm" disabled={act.isPending} onClick={() => { if (window.confirm('Mark as no-show?')) act.mutate({ id: b.id, patch: { status: 'no_show' } }) }}>No show</button>}
                {b.mode === 'home' && ['confirmed', 'provider_assigned', 'on_the_way'].includes(b.status) && <LiveShare bookingId={b.id} auto={b.status === 'on_the_way'} />}
                {CHAT_STATUSES.includes(b.status) && <ChatButton bookingId={b.id} onOpen={() => setChat({ id: b.id, title: b.customer_name, phone: b.customer_phone })} />}
                {b.payment_status === 'cash_due' && ['in_progress', 'completed'].includes(b.status) && <button className="btn btn-dark btn-sm" disabled={cash.isPending} onClick={() => cash.mutate(b.id)}><Banknote className="h-4 w-4" />Cash collected</button>}
              </div>
            </article>)
        })}</div>)}
      {chat && <BookingChat bookingId={chat.id} title={chat.title} phone={chat.phone} onClose={() => setChat(null)} />}
    </div>
  )
}

/** Shares the beautician's live location for ONE booking, only while the toggle is on. */
function LiveShare({ bookingId, auto = false }: { bookingId: string; auto?: boolean }) {
  const { user } = useAuth()
  const toast = useToast()
  const [on, setOn] = useState(false)
  const watch = useRef<number | null>(null)
  const last = useRef(0)
  const stop = () => { if (watch.current != null) navigator.geolocation.clearWatch(watch.current); watch.current = null; setOn(false) }
  useEffect(() => () => { if (watch.current != null) navigator.geolocation.clearWatch(watch.current) }, [])
  const start = () => {
    if (!navigator.geolocation) return toast.error('Location is not supported on this device.')
    setOn(true)
    watch.current = navigator.geolocation.watchPosition(async (p) => {
      if (Date.now() - last.current < 10_000) return
      last.current = Date.now()
      const r = await supabase.from('provider_locations').upsert({ booking_id: bookingId, provider_id: user!.id, lat: p.coords.latitude, lng: p.coords.longitude, accuracy_m: p.coords.accuracy, heading: p.coords.heading })
      if (r.error) { toast.error(friendlyError(r.error)); stop() }
    }, () => { toast.error('Could not read your location. Check permission.'); stop() }, { enableHighAccuracy: true, maximumAge: 5000 })
  }
  useEffect(() => { if (auto && !on && watch.current == null) start() }, [auto]) // eslint-disable-line react-hooks/exhaustive-deps
  return on
    ? <button className="btn btn-primary btn-sm" onClick={stop}><Radio className="h-4 w-4 animate-pulse" />Sharing… tap to stop</button>
    : <button className="btn btn-outline btn-sm" onClick={start}><Navigation className="h-4 w-4" />Share live location</button>
}

function Reports({ salon }: { salon: Salon }) {
  const q = useSalonBookings(salon.id)
  const data = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, i) => istDate(i - 13))
    const ist = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(iso))
    const done = (q.data ?? []).filter((b) => b.status === 'completed')
    const by = days.map((d) => ({ d, rev: done.filter((b) => ist(b.scheduled_start) === d).reduce((a, b) => a + Number(b.total_inr), 0), n: done.filter((b) => ist(b.scheduled_start) === d).length }))
    const all = q.data ?? []
    return { by, max: Math.max(1, ...by.map((x) => x.rev)), total: done.reduce((a, b) => a + Number(b.total_inr), 0), done: done.length, cancelled: all.filter((b) => ['cancelled', 'rejected'].includes(b.status)).length, all: all.length }
  }, [q.data])
  if (q.isLoading) return <Skeleton className="h-48" />
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[['All bookings', data.all], ['Completed', data.done], ['Cancelled / rejected', data.cancelled], ['Lifetime revenue', inr(data.total)]].map(([l, v]) => <div key={l as string} className="card p-4"><p className="font-display text-2xl font-semibold">{v}</p><p className="text-xs text-muted">{l}</p></div>)}</div>
      <div className="card p-4"><h3 className="mb-3 font-display text-lg font-semibold">Revenue — last 14 days</h3>
        <div className="flex h-40 items-end gap-1.5" role="img" aria-label="Revenue per day for the last 14 days">{data.by.map((x) => <div key={x.d} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${x.d}: ${inr(x.rev)} (${x.n})`}><div className="w-full rounded-t bg-gradient-to-t from-lush-600 to-lush-400" style={{ height: `${(x.rev / data.max) * 100}%`, minHeight: x.rev ? 4 : 1 }} /><span className="text-[9px] text-muted">{x.d.slice(8)}</span></div>)}</div>
        <p className="mt-2 text-xs text-muted">Based on completed bookings, amounts include taxes.</p></div>
    </div>
  )
}

function Account({ salon }: { salon: Salon }) {
  const { user, profile, signOut } = useAuth()
  const nav = useNavigate()
  return (
    <div className="card max-w-lg space-y-3 p-5 text-sm">
      <h3 className="font-display text-lg font-semibold">My account</h3>
      <p><span className="text-muted">Name:</span> {profile?.full_name || '—'}</p>
      <p><span className="text-muted">Login email:</span> {user?.email}</p>
      <p><span className="text-muted">Salon:</span> {salon.name} <span className="chip capitalize">{salon.status}</span></p>
      <p><span className="text-muted">Salon phone:</span> {salon.contact_phone}</p>
      <div className="flex flex-wrap gap-2 pt-2">
        {['draft', 'rejected'].includes(salon.status) && <Link to="/partner/register" className="btn btn-primary btn-sm">Edit registration</Link>}
        <button className="btn btn-outline btn-sm" onClick={async () => { await signOut(); nav('/partner/login') }}>Log out</button>
      </div>
    </div>
  )
}
