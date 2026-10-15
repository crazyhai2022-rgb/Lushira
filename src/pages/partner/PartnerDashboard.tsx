import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Banknote, Bell, ChevronDown, Volume1, Volume2, BellOff, BellRing, CalendarClock, CalendarDays, Check, IndianRupee, MapPin, Navigation, Phone, Radio, X } from 'lucide-react'
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
import MapView from '../../components/MapView'
import BookingChat, { CHAT_STATUSES, ChatButton, useChatDelivery } from '../../components/BookingChat'
import { playRing, useOrderRing, useRingSetting, useRingVolume } from '../../lib/ring'
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
          {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`chip shrink-0 !px-4 !py-2 text-sm ${tab === k ? 'chip-active' : ''}`}>{l}{k === 'bookings' && <LiveDot salonId={salon.id} />}</button>)}
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
  const [vol, setVol] = useRingVolume()
  const { blocked } = useOrderRing(pending > 0, on, vol)
  return (
    <div className="mb-4 space-y-2">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white p-3">
        <div className="flex items-center gap-2 text-sm">{on ? <BellRing className="h-5 w-5 text-lush-600" /> : <BellOff className="h-5 w-5 text-muted" />}<span className="font-medium">New order ring</span><span className={`chip ${on ? 'bg-green-100 text-green-800' : ''}`}>{on ? 'ON' : 'OFF'}</span></div>
        <div className="flex items-center gap-2">
          {on && <button type="button" className="btn btn-ghost btn-sm" onClick={() => void playRing(vol)}>Test</button>}
          <button type="button" role="switch" aria-checked={on} aria-label="Order ring on or off" onClick={() => { setOn(!on); if (!on) void playRing(vol) }}
            className={`relative h-7 w-12 rounded-full transition ${on ? 'bg-lush-600' : 'bg-blush-300'}`}><span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} /></button>
        </div>
      </div>
      {on && (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-white px-3 py-2">
          <Volume1 className="h-4 w-4 shrink-0 text-muted" />
          <input type="range" min={10} max={100} step={5} value={Math.round(vol * 100)} aria-label="Ring volume" className="h-2 flex-1 accent-lush-600"
            onChange={(e) => setVol(Number(e.target.value) / 100)} onPointerUp={() => void playRing(vol)} onKeyUp={() => void playRing(vol)} />
          <Volume2 className="h-5 w-5 shrink-0 text-lush-600" /><span className="w-10 text-right text-xs font-medium">{Math.round(vol * 100)}%</span>
        </div>)}
      {pending > 0 && (
        <button type="button" onClick={open} className="flex w-full items-center justify-between gap-3 rounded-xl bg-gradient-to-r from-lush-600 to-plum-700 p-3 text-left text-white shadow-lg">
          <span className="flex items-center gap-2 font-semibold"><BellRing className="h-5 w-5 animate-pulse" />{pending} new booking request{pending > 1 ? 's' : ''}!</span><span className="text-sm underline">View &amp; accept</span>
        </button>)}
      {pending > 0 && on && blocked && <p className="text-xs text-amber-700">Tap anywhere on the screen once so your phone allows the ring sound.</p>}
    </div>
  )
}

const LIVE: BookingStatus[] = ['confirmed', 'provider_assigned', 'on_the_way', 'in_progress']
const DONE: BookingStatus[] = ['completed', 'cancelled', 'rejected', 'no_show']

/** Green blinking dot while at least one accepted order is live. */
function LiveDot({ salonId }: { salonId: string }) {
  const q = useSalonBookings(salonId)
  if (!(q.data ?? []).some((b) => LIVE.includes(b.status))) return null
  return <span className="relative ml-2 inline-flex h-2.5 w-2.5" aria-label="Live order in progress"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" /></span>
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
      <Charts bookings={q.data ?? []} loading={q.isLoading} />
      <section><h3 className="mb-2 font-display text-lg font-semibold">Recent notifications</h3>
        {notes.data?.length ? <ul className="space-y-2">{notes.data.map((n) => <li key={n.id} className="card p-3 text-sm"><p className="font-medium">{n.title}</p><p className="text-muted">{n.body}</p><p className="text-xs text-muted">{fmtDateTime(n.created_at)}</p></li>)}</ul> : <p className="text-sm text-muted">No notifications yet.</p>}</section>
    </div>
  )
}


const STATUS_META: { k: string; l: string; c: string; match: (b: Booking) => boolean }[] = [
  { k: 'done', l: 'Completed', c: '#16a34a', match: (b) => b.status === 'completed' },
  { k: 'live', l: 'Live / upcoming', c: '#215f47', match: (b) => LIVE.includes(b.status) },
  { k: 'new', l: 'New request', c: '#f59e0b', match: (b) => b.status === 'pending' },
  { k: 'lost', l: 'Cancelled / rejected', c: '#94a3b8', match: (b) => ['cancelled', 'rejected', 'no_show'].includes(b.status) },
]

/** Overview graphs: revenue & orders for the last 14 days, order status mix, cash vs online, top services. Plain SVG, no library. */
function Charts({ bookings, loading }: { bookings: Booking[]; loading: boolean }) {
  const d = useMemo(() => {
    const ist = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(iso))
    const days = Array.from({ length: 14 }, (_, i) => istDate(i - 13))
    const valid = bookings.filter((b) => !['cancelled', 'rejected', 'no_show'].includes(b.status))
    const perDay = days.map((day) => {
      const done = bookings.filter((b) => b.status === 'completed' && ist(b.scheduled_start) === day)
      return { day, label: day.slice(8), revenue: done.reduce((a, b) => a + Number(b.total_inr), 0), orders: valid.filter((b) => ist(b.scheduled_start) === day).length }
    })
    const status = STATUS_META.map((m) => ({ ...m, n: bookings.filter(m.match).length }))
    const paidB = bookings.filter((b) => b.status === 'completed')
    const cash = paidB.filter((b) => b.payment_method === 'cash').reduce((a, b) => a + Number(b.total_inr), 0)
    const online = paidB.filter((b) => b.payment_method !== 'cash').reduce((a, b) => a + Number(b.total_inr), 0)
    const svc = new Map<string, number>()
    valid.forEach((b) => b.booking_items?.forEach((i) => svc.set(i.name, (svc.get(i.name) ?? 0) + i.quantity)))
    const top = [...svc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
    return { perDay, status, cash, online, top, total: bookings.length }
  }, [bookings])
  if (loading) return <Skeleton className="h-64" />
  if (!d.total) return <p className="card p-5 text-center text-sm text-muted">Graphs will appear here after your first booking.</p>
  const maxRev = Math.max(1, ...d.perDay.map((x) => x.revenue))
  const maxOrd = Math.max(1, ...d.perDay.map((x) => x.orders))
  const W = 300, H = 110
  const pts = d.perDay.map((x, i) => [8 + (i * (W - 16)) / 13, H - 10 - (x.orders / maxOrd) * (H - 24)] as const)
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${pts[13][0].toFixed(1)},${H - 10} L${pts[0][0].toFixed(1)},${H - 10} Z`
  const pay = d.cash + d.online
  const maxSvc = Math.max(1, ...d.top.map((t) => t[1]))
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card p-4">
        <h3 className="font-display text-lg font-semibold">Revenue — last 14 days</h3>
        <div className="mt-3 flex h-36 items-end gap-1" role="img" aria-label="Revenue per day">
          {d.perDay.map((x) => <div key={x.day} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${x.day}: ${inr(x.revenue)}`}>
            <div className="w-full rounded-t bg-gradient-to-t from-lush-600 to-lush-400" style={{ height: `${(x.revenue / maxRev) * 100}%`, minHeight: x.revenue ? 4 : 2, opacity: x.revenue ? 1 : 0.25 }} /><span className="text-[9px] text-muted">{x.label}</span></div>)}
        </div>
        <p className="mt-2 text-xs text-muted">Completed orders only. Total: <strong>{inr(d.perDay.reduce((a, x) => a + x.revenue, 0))}</strong></p>
      </section>

      <section className="card p-4">
        <h3 className="font-display text-lg font-semibold">Orders — last 14 days</h3>
        <svg viewBox={`0 0 ${W} ${H + 12}`} className="mt-3 w-full" role="img" aria-label="Orders per day">
          {[0, 0.5, 1].map((g) => <line key={g} x1="8" x2={W - 8} y1={H - 10 - g * (H - 24)} y2={H - 10 - g * (H - 24)} stroke="currentColor" className="text-line" strokeWidth="0.6" />)}
          <path d={area} fill="#215f47" opacity="0.12" /><path d={line} fill="none" stroke="#215f47" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.6" fill="#215f47"><title>{`${d.perDay[i].day}: ${d.perDay[i].orders} order(s)`}</title></circle>)}
          {d.perDay.map((x, i) => (i % 2 === 0 ? <text key={x.day} x={pts[i][0]} y={H + 8} textAnchor="middle" fontSize="8" fill="currentColor" className="text-muted">{x.label}</text> : null))}
        </svg>
        <p className="text-xs text-muted">Busiest day: <strong>{maxOrd} order{maxOrd > 1 ? 's' : ''}</strong></p>
      </section>

      <section className="card p-4">
        <h3 className="font-display text-lg font-semibold">Order status</h3>
        <div className="mt-4 flex h-5 w-full overflow-hidden rounded-full bg-blush-100" role="img" aria-label="Order status split">
          {d.status.filter((x) => x.n).map((x) => <div key={x.k} style={{ width: `${(x.n / d.total) * 100}%`, background: x.c }} title={`${x.l}: ${x.n}`} />)}
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-2 text-sm">{d.status.map((x) => <li key={x.k} className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: x.c }} />{x.l}<strong className="ml-auto">{x.n}</strong></li>)}</ul>
      </section>

      <section className="card p-4">
        <h3 className="font-display text-lg font-semibold">Top services &amp; payments</h3>
        <ul className="mt-3 space-y-2">{d.top.length ? d.top.map(([n, c]) => <li key={n} className="text-sm"><div className="flex justify-between"><span className="truncate">{n}</span><strong>{c}</strong></div><div className="mt-1 h-2 rounded-full bg-blush-100"><div className="h-2 rounded-full bg-lush-600" style={{ width: `${(c / maxSvc) * 100}%` }} /></div></li>) : <li className="text-sm text-muted">No services booked yet.</li>}</ul>
        <div className="mt-4 border-t border-line pt-3 text-sm">
          <div className="flex h-3 overflow-hidden rounded-full bg-blush-100"><div style={{ width: pay ? `${(d.cash / pay) * 100}%` : 0, background: '#f59e0b' }} /><div style={{ width: pay ? `${(d.online / pay) * 100}%` : 0, background: '#0ea5e9' }} /></div>
          <div className="mt-2 flex justify-between text-xs"><span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" />Cash {inr(d.cash)}</span><span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-sky-500" />Online {inr(d.online)}</span></div>
        </div>
      </section>
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
  if (b.status === 'in_progress' && b.payment_method === 'razorpay' && b.payment_status !== 'paid') return null
  if (b.status === 'in_progress') return { to: 'completed', label: b.payment_status === 'cash_due' ? 'Cash received & complete' : 'Mark completed' }
  return null
}

function Bookings({ salon }: { salon: Salon }) {
  const toast = useToast()
  const qc = useQueryClient()
  const [f, setF] = useState<'all' | 'new' | 'live' | 'past'>('all')
  const [chat, setChat] = useState<{ id: string; title: string; phone: string } | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const q = useSalonBookings(salon.id)
  const staff = useQuery({ queryKey: ['p-staff-act', salon.id], queryFn: async () => { const r = await supabase.from('salon_staff').select('id,name').eq('salon_id', salon.id).eq('is_active', true); return r.data ?? [] } })
  const act = useMutation({
    mutationFn: async (p: { id: string; patch: Record<string, unknown>; collectCash?: boolean }) => { if (p.collectCash) { const c = await supabase.rpc('mark_cash_collected', { p_booking_id: p.id }); if (c.error) throw c.error } const r = await supabase.from('bookings').update(p.patch).eq('id', p.id).select('id,status').single(); if (r.error) throw r.error; if (p.patch.status && r.data.status !== p.patch.status) throw new Error('That status change is not allowed right now.') },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['p-bookings', salon.id] }), onError: (e) => toast.error(friendlyError(e)),
  })
  const cash = useMutation({
    mutationFn: async (id: string) => { const r = await supabase.rpc('mark_cash_collected', { p_booking_id: id }); if (r.error) throw r.error },
    onSuccess: () => { toast.success('Cash payment recorded.'); void qc.invalidateQueries({ queryKey: ['p-bookings', salon.id] }) }, onError: (e) => toast.error(friendlyError(e)),
  })
  const liveCount = (q.data ?? []).filter((b) => LIVE.includes(b.status)).length
  const newCount = (q.data ?? []).filter((b) => b.status === 'pending').length
  const list = (q.data ?? []).filter((b) => f === 'all' ? true : f === 'new' ? b.status === 'pending' : f === 'live' ? LIVE.includes(b.status) : DONE.includes(b.status))
  return (
    <div>
      <div className="mb-4 flex gap-2 overflow-x-auto" role="tablist" aria-label="Order filter">{([['all', 'All orders'], ['new', 'New requests'], ['live', 'Live order'], ['past', 'Past']] as const).map(([k, l]) => (
        <button key={k} role="tab" aria-selected={f === k} onClick={() => setF(k)} className={`chip shrink-0 !px-4 !py-2 text-sm ${f === k ? 'chip-active' : ''}`}>{l}
          {k === 'new' && newCount > 0 && <span className="ml-1.5 rounded-full bg-lush-600 px-1.5 text-[11px] font-bold text-white">{newCount}</span>}
          {k === 'live' && liveCount > 0 && <span className="relative ml-2 inline-flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" /></span>}
        </button>))}</div>
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
              {b.status === 'in_progress' && b.payment_method === 'razorpay' && b.payment_status !== 'paid' && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">Waiting for the customer's online payment. You can complete the order once it is paid.</p>}
              {['confirmed', 'provider_assigned', 'on_the_way', 'in_progress', 'completed'].includes(b.status) && (
                <ol className="mt-3 flex items-center gap-1 overflow-x-auto text-[11px]" aria-label="Order progress">
                  {(b.mode === 'home' ? FLOW_HOME : FLOW_SALON).map((st, i, arr) => { const cur = arr.indexOf(b.status); return (
                    <li key={st} className="flex items-center gap-1"><span className={`whitespace-nowrap rounded-full px-2.5 py-1 font-medium ${i < cur ? 'bg-green-100 text-green-800' : i === cur ? 'bg-lush-600 text-white' : 'bg-blush-100 text-muted'}`}>{i < cur ? '✓ ' : ''}{FLOW_LABEL[st]}</span>{i < arr.length - 1 && <span className="text-muted">›</span>}</li>) })}
                </ol>)}
              {openId === b.id && (
                <div className="mt-3 space-y-3 rounded-xl border border-line bg-blush-50 p-3 text-sm">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <p><span className="text-muted">Customer:</span> <strong>{b.customer_name}</strong></p>
                    <p><span className="text-muted">Mobile:</span> <a className="text-lush-600" href={`tel:${b.customer_phone}`}>{b.customer_phone}</a></p>
                    <p><span className="text-muted">Service:</span> {b.booking_items?.map((i) => `${i.name}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`).join(', ')}</p>
                    <p><span className="text-muted">Payment:</span> {b.payment_method === 'cash' ? 'Cash on service' : 'Paid online'} · {inr(b.total_inr)}</p>
                    {b.mode === 'home' && b.address && <p className="sm:col-span-2"><span className="text-muted">Address:</span> {[b.address.line1, b.address.landmark, b.address.area, b.address.city, b.address.pin_code].filter(Boolean).join(', ')}</p>}
                  </div>
                  {b.mode === 'home' && b.address?.lat != null && b.address?.lng != null && (<>
                    <div className="overflow-hidden rounded-xl"><MapView center={[b.address.lat, b.address.lng]} height={200} zoom={16} markers={[{ id: 'cust', lat: b.address.lat, lng: b.address.lng, label: b.customer_name, sub: 'Customer location', kind: 'home' }]} /></div>
                    <a className="btn btn-primary btn-sm" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${b.address.lat},${b.address.lng}`}><Navigation className="h-4 w-4" />Navigate to customer</a>
                  </>)}
                </div>)}
              {b.notes && <p className="mt-2 rounded-lg bg-blush-50 p-2 text-xs text-muted">Note: {b.notes}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {b.status === 'pending' && (awaitingPay ? <span className="chip bg-amber-100 text-amber-800">Awaiting customer payment</span> : <>
                  <button className="btn btn-primary btn-sm" disabled={act.isPending} onClick={() => act.mutate({ id: b.id, patch: { status: 'confirmed' } })}><Check className="h-4 w-4" />Accept</button>
                  <button className="btn btn-outline btn-sm" disabled={act.isPending} onClick={() => { if (window.confirm('Reject this booking?')) act.mutate({ id: b.id, patch: { status: 'rejected' } }) }}><X className="h-4 w-4" />Reject</button></>)}
                {b.status === 'confirmed' && b.mode === 'home' && (staff.data?.length ?? 0) > 0 && (
                  <select className="input !w-auto !py-1.5 text-xs" aria-label="Assign beautician" value={b.staff_id ?? ''} onChange={(e) => e.target.value && act.mutate({ id: b.id, patch: { staff_id: e.target.value, status: 'provider_assigned' } })}><option value="">Assign beautician…</option>{staff.data!.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>)}
                {nextStep(b) && <button className="btn btn-primary btn-sm" disabled={act.isPending} onClick={() => act.mutate({ id: b.id, patch: { status: nextStep(b)!.to }, collectCash: nextStep(b)!.to === 'completed' && b.payment_status === 'cash_due' })}><Check className="h-4 w-4" />{nextStep(b)!.label}</button>}
                {['confirmed', 'provider_assigned', 'on_the_way'].includes(b.status) && <button className="btn btn-ghost btn-sm" disabled={act.isPending} onClick={() => { if (window.confirm('Mark as no-show?')) act.mutate({ id: b.id, patch: { status: 'no_show' } }) }}>No show</button>}
                {b.mode === 'home' && ['confirmed', 'provider_assigned', 'on_the_way'].includes(b.status) && <LiveShare bookingId={b.id} auto={b.status === 'on_the_way'} />}
                {!['pending', 'rejected'].includes(b.status) && <button className="btn btn-ghost btn-sm" aria-expanded={openId === b.id} onClick={() => setOpenId(openId === b.id ? null : b.id)}>View order<ChevronDown className={`h-4 w-4 transition ${openId === b.id ? 'rotate-180' : ''}`} /></button>}
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
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium">
      <Radio className={`h-4 w-4 ${on ? 'animate-pulse text-green-600' : 'text-muted'}`} />Live location
      <button type="button" role="switch" aria-checked={on} aria-label="Share live location" onClick={on ? stop : start}
        className={`relative h-5 w-9 rounded-full transition ${on ? 'bg-green-600' : 'bg-blush-300'}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} /></button>
    </label>
  )
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
