import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Banknote, CreditCard, Crosshair, MapPin, Tag } from 'lucide-react'
import { useCart } from '../context/CartContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useSettings } from '../hooks/useSettings'
import { realEmail } from '../lib/mobileAuth'
import { supabase } from '../lib/supabase'
import { getSlots } from '../lib/api'
import { dayLabel, duration, fmtTime, inr, istDate, normalizePhone } from '../lib/format'
import { friendlyError } from '../lib/errors'
import { searchPlaces, reverseGeocode, type PlaceHit } from '../lib/geocode'
import { payForBooking } from '../lib/payment'
import { Field, Spinner } from '../components/ui'
import MapView from '../components/MapView'

type Pay = 'razorpay' | 'cash'
interface Addr { line1: string; landmark: string; area: string; city: string; pin_code: string; lat: number | null; lng: number | null }
const emptyAddr: Addr = { line1: '', landmark: '', area: '', city: '', pin_code: '', lat: null, lng: null }

export default function Checkout() {
  const cart = useCart()
  const { user, profile } = useAuth()
  const toast = useToast()
  const nav = useNavigate()
  const st = useSettings()
  const [date, setDate] = useState(istDate(0))
  const [slot, setSlot] = useState<string | null>(null)
  const [staffId, setStaffId] = useState<string>('')
  const [name, setName] = useState(profile?.full_name ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [email, setEmail] = useState(realEmail(user?.email))
  const [notes, setNotes] = useState('')
  const [addr, setAddr] = useState<Addr>(emptyAddr)
  const [pay, setPay] = useState<Pay | null>(null)
  const [code, setCode] = useState(cart.coupon)
  const [coupon, setCoupon] = useState<{ code: string; discount: number } | null>(null)
  const [couponMsg, setCouponMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [errs, setErrs] = useState<Record<string, string>>({})
  const [geoBusy, setGeoBusy] = useState(false)
  const [placeQ, setPlaceQ] = useState('')
  const [hits, setHits] = useState<PlaceHit[]>([])

  useEffect(() => { if (profile) { setName((n) => n || profile.full_name); setPhone((p) => p || profile.phone || '') } }, [profile])

  const salonId = cart.salon?.id ?? ''
  const totalMin = cart.totalMinutes
  const home = cart.mode === 'home'
  const razorOk = !!st.razorpayKeyId && st.onlineEnabled
  useEffect(() => { if (!pay) setPay(razorOk ? 'razorpay' : st.cashEnabled ? 'cash' : null) }, [razorOk, st.cashEnabled, pay])

  const meta = useQuery({
    queryKey: ['checkout-meta', salonId, cart.items.map((i) => i.id).join(',')], enabled: !!salonId,
    queryFn: async () => {
      const [b, s, saved] = await Promise.all([
        supabase.from('salon_services').select('id,buffer_min').in('id', cart.items.map((i) => i.id)),
        supabase.from('salon_staff').select('id,name,role_title').eq('salon_id', salonId).eq('is_active', true),
        supabase.from('customer_addresses').select('id,label,line1,landmark,area,city,pin_code,location').order('created_at', { ascending: false }),
      ])
      return {
        buffer: Math.max(0, ...(b.data ?? []).map((x) => x.buffer_min as number)),
        staff: (s.data ?? []) as { id: string; name: string; role_title: string | null }[],
        saved: (saved.data ?? []) as { id: string; label: string; line1: string; landmark: string | null; area: string | null; city: string | null; pin_code: string | null; location: { coordinates?: [number, number] } | null }[],
      }
    },
  })
  const buffer = meta.data?.buffer ?? 0

  const slots = useQuery({
    queryKey: ['slots', salonId, date, totalMin, staffId, buffer], enabled: !!salonId && !!meta.data,
    queryFn: () => getSlots(salonId, date, totalMin, staffId || null, buffer),
  })
  useEffect(() => { setSlot(null) }, [date, staffId])

  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => istDate(i)), [])
  const discount = coupon?.discount ?? 0
  const tax = Math.round((cart.subtotal - discount) * st.taxPercent) / 100
  const total = cart.subtotal - discount + tax + st.platformFee

  if (!cart.items.length || !cart.salon) return <Navigate to="/cart" replace />

  const applyCoupon = async () => {
    if (!code.trim()) return
    const r = await supabase.rpc('validate_coupon', { p_code: code.trim(), p_salon_id: salonId, p_subtotal: cart.subtotal })
    if (r.error) return setCouponMsg(friendlyError(r.error))
    const d = r.data as { valid: boolean; discount_inr?: number; reason?: string }
    if (d.valid) { setCoupon({ code: code.trim(), discount: Number(d.discount_inr) }); setCouponMsg(''); cart.setCoupon(code.trim()) }
    else { setCoupon(null); setCouponMsg(friendlyError(d.reason ?? 'coupon_invalid')) }
  }

  const useGps = () => {
    if (!navigator.geolocation) return toast.error('Location is not supported on this device.')
    setGeoBusy(true)
    navigator.geolocation.getCurrentPosition(async (p) => {
      const label = await reverseGeocode(p.coords.latitude, p.coords.longitude).catch(() => '')
      setAddr((a) => ({ ...a, lat: p.coords.latitude, lng: p.coords.longitude, area: a.area || label.split(',')[0] }))
      setGeoBusy(false)
    }, () => { setGeoBusy(false); toast.error('Could not get your location. Search for your area instead.') }, { enableHighAccuracy: true, timeout: 15000 })
  }
  const searchArea = async () => {
    if (placeQ.trim().length < 3) return
    try { setHits(await searchPlaces(placeQ.trim())) } catch { toast.error('Search failed. Try again.') }
  }

  const validate = () => {
    const e: Record<string, string> = {}
    if (name.trim().length < 2) e.name = 'Enter your full name'
    if (!normalizePhone(phone)) e.phone = 'Enter a valid 10-digit mobile number'
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) e.email = 'Enter a valid email'
    if (!slot) e.slot = 'Choose a time slot'
    if (home) {
      if (addr.line1.trim().length < 3) e.line1 = 'Enter your house / street address'
      if (!/^\d{6}$/.test(addr.pin_code)) e.pin = 'Enter a 6-digit PIN code'
      if (addr.lat == null || addr.lng == null) e.geo = 'Set your location using “Use current location” or by searching your area'
    }
    if (!pay) e.pay = 'Select a payment method'
    setErrs(e)
    return Object.keys(e).length === 0
  }

  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    if (!validate() || busy) return
    setBusy(true)
    const r = await supabase.rpc('create_booking', {
      p_salon_id: salonId,
      p_items: cart.items.map((i) => ({ salon_service_id: i.id, quantity: i.qty })),
      p_start: slot, p_mode: cart.mode, p_staff_id: staffId || null,
      p_customer_name: name.trim(), p_customer_phone: normalizePhone(phone), p_customer_email: email.trim() || null, p_notes: notes.trim() || null,
      p_address: home ? { line1: addr.line1.trim(), landmark: addr.landmark.trim() || undefined, area: addr.area.trim() || undefined, city: addr.city.trim() || undefined, pin_code: addr.pin_code, lat: addr.lat, lng: addr.lng } : null,
      p_address_lat: home ? addr.lat : null, p_address_lng: home ? addr.lng : null,
      p_payment_method: pay, p_coupon_code: coupon?.code ?? null,
    })
    if (r.error) {
      setBusy(false)
      toast.error(friendlyError(r.error))
      if (String(r.error.message).includes('slot_unavailable')) void slots.refetch()
      return
    }
    const b = r.data as { id: string }
    if (pay === 'razorpay') {
      try {
        const res = await payForBooking(b.id, { name: name.trim(), email: email.trim() || undefined, contact: normalizePhone(phone) ?? undefined })
        if (res === 'failed') toast.error('Payment could not be confirmed. You can retry from your order page.')
        if (res === 'dismissed') toast.info('Payment not completed. You can pay from your order page.')
      } catch (e) { toast.error(friendlyError(e)) }
    }
    setBusy(false)
    nav(`/order/${b.id}`, { replace: true })
    cart.clear()
  }

  const saved = meta.data?.saved ?? []
  return (
    <form onSubmit={submit} className="container-x py-8" noValidate>
      <nav className="mb-2 text-xs text-muted"><Link to="/cart" className="hover:underline">Cart</Link> › Checkout</nav>
      <h1 className="text-3xl font-semibold">Book your appointment</h1>
      <p className="text-sm text-muted">{cart.salon.name} · {home ? 'At your home' : 'At the salon'} · {duration(totalMin)}</p>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="font-display text-xl font-semibold">1. Date &amp; time</h2>
            <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-2" role="listbox" aria-label="Date">
              {days.map((d) => (
                <button type="button" key={d} role="option" aria-selected={d === date} onClick={() => setDate(d)}
                  className={`shrink-0 rounded-xl border px-3 py-2 text-center text-xs font-medium ${d === date ? 'border-lush-600 bg-lush-600 text-white' : 'border-line bg-white'}`}>
                  {dayLabel(d).split(' ').map((p, i) => <div key={i} className={i === 0 ? 'opacity-80' : 'text-sm font-semibold'}>{p}</div>)}
                </button>))}
            </div>
            {(meta.data?.staff.length ?? 0) > 0 && (
              <label className="mt-3 block"><span className="label">Preferred beautician (optional)</span>
                <select className="input" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                  <option value="">Any available</option>{meta.data!.staff.map((s) => <option key={s.id} value={s.id}>{s.name}{s.role_title ? ` — ${s.role_title}` : ''}</option>)}
                </select></label>)}
            <div className="mt-4">
              {slots.isLoading ? <Spinner /> : slots.isError ? <p className="text-sm text-red-600">Could not load slots. <button type="button" className="underline" onClick={() => slots.refetch()}>Retry</button></p> :
                (slots.data?.length ?? 0) === 0 ? <p className="rounded-xl bg-blush-100 p-3 text-sm text-muted">No slots available on this day for {duration(totalMin)}. Try another date.</p> : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5" role="listbox" aria-label="Time slots">
                    {slots.data!.map((s) => (
                      <button type="button" key={s.slot_start} role="option" aria-selected={slot === s.slot_start} onClick={() => setSlot(s.slot_start)}
                        className={`rounded-lg border px-2 py-2 text-sm font-medium ${slot === s.slot_start ? 'border-lush-600 bg-lush-600 text-white' : 'border-line hover:border-lush-400'}`}>{fmtTime(s.slot_start)}</button>))}
                  </div>)}
              {errs.slot && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{errs.slot}</p>}
            </div>
          </section>

          <section className="card grid gap-3 p-5 sm:grid-cols-2">
            <h2 className="font-display text-xl font-semibold sm:col-span-2">2. Your details</h2>
            <Field label="Full name" required error={errs.name}><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
            <Field label="Mobile number" required error={errs.phone}><input className="input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="98765 43210" /></Field>
            <div className="sm:col-span-2"><Field label="Email (optional)" error={errs.email}><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field></div>
            <div className="sm:col-span-2"><Field label="Notes for the salon (optional)"><textarea className="input min-h-20" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Allergies, preferences, parking info…" /></Field></div>
          </section>

          {home && (
            <section className="card space-y-3 p-5">
              <h2 className="font-display text-xl font-semibold">3. Service address</h2>
              {saved.length > 0 && (
                <div className="flex flex-wrap gap-2">{saved.map((a) => (
                  <button type="button" key={a.id} className="chip hover:bg-blush-200" onClick={() => setAddr({ line1: a.line1, landmark: a.landmark ?? '', area: a.area ?? '', city: a.city ?? '', pin_code: a.pin_code ?? '', lat: a.location?.coordinates?.[1] ?? null, lng: a.location?.coordinates?.[0] ?? null })}>
                    <MapPin className="h-3 w-3" />{a.label}</button>))}</div>)}
              <Field label="House / flat / street" required error={errs.line1}><input className="input" value={addr.line1} onChange={(e) => setAddr({ ...addr, line1: e.target.value })} autoComplete="address-line1" /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Landmark"><input className="input" value={addr.landmark} onChange={(e) => setAddr({ ...addr, landmark: e.target.value })} /></Field>
                <Field label="Area"><input className="input" value={addr.area} onChange={(e) => setAddr({ ...addr, area: e.target.value })} /></Field>
                <Field label="City"><input className="input" value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} autoComplete="address-level2" /></Field>
                <Field label="PIN code" required error={errs.pin}><input className="input" inputMode="numeric" maxLength={6} value={addr.pin_code} onChange={(e) => setAddr({ ...addr, pin_code: e.target.value.replace(/\D/g, '') })} autoComplete="postal-code" /></Field>
              </div>
              <div className="rounded-xl bg-blush-100 p-3">
                <p className="text-sm font-medium">Pin your location</p>
                <p className="text-xs text-muted">Your exact location is shared with the salon only for this booking, so the beautician can reach you.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" className="btn btn-outline btn-sm" onClick={useGps} disabled={geoBusy}><Crosshair className="h-4 w-4" />{geoBusy ? 'Locating…' : 'Use current location'}</button>
                  <div className="flex min-w-[200px] flex-1 gap-2">
                    <input className="input !py-1.5 text-sm" placeholder="Search your area or landmark" value={placeQ} onChange={(e) => setPlaceQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void searchArea() } }} />
                    <button type="button" className="btn btn-dark btn-sm" onClick={searchArea}>Search</button>
                  </div>
                </div>
                {hits.length > 0 && <ul className="mt-2 divide-y divide-line rounded-xl bg-white text-sm">{hits.map((h, i) => (
                  <li key={i}><button type="button" className="w-full px-3 py-2 text-left hover:bg-blush-50" onClick={() => { setAddr({ ...addr, lat: h.lat, lng: h.lng }); setHits([]); setPlaceQ(h.label) }}>{h.label}</button></li>))}</ul>}
                {addr.lat != null && addr.lng != null && (
                  <div className="mt-3 overflow-hidden rounded-xl"><MapView center={[addr.lat, addr.lng]} height={160} zoom={16} markers={[{ id: 'a', lat: addr.lat, lng: addr.lng, label: 'Service location', kind: 'home' }]} /></div>)}
                {errs.geo && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{errs.geo}</p>}
              </div>
            </section>)}

          <section className="card p-5">
            <h2 className="font-display text-xl font-semibold">{home ? '4' : '3'}. Payment</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${pay === 'razorpay' ? 'border-lush-600 bg-blush-50' : 'border-line'} ${!razorOk ? 'opacity-60' : ''}`}>
                <input type="radio" name="pay" className="mt-1 accent-lush-600" disabled={!razorOk} checked={pay === 'razorpay'} onChange={() => setPay('razorpay')} />
                <span><span className="flex items-center gap-2 font-medium"><CreditCard className="h-4 w-4" />Pay online</span>
                  <span className="block text-xs text-muted">{razorOk ? 'UPI, cards, netbanking & wallets via Razorpay.' : 'Online payment is not enabled yet.'}</span></span>
              </label>
              <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${pay === 'cash' ? 'border-lush-600 bg-blush-50' : 'border-line'} ${!st.cashEnabled ? 'opacity-60' : ''}`}>
                <input type="radio" name="pay" className="mt-1 accent-lush-600" disabled={!st.cashEnabled} checked={pay === 'cash'} onChange={() => setPay('cash')} />
                <span><span className="flex items-center gap-2 font-medium"><Banknote className="h-4 w-4" />Pay cash on service</span>
                  <span className="block text-xs text-muted">Pay the salon / beautician after the service.</span></span>
              </label>
            </div>
            {errs.pay && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{errs.pay}</p>}
          </section>
        </div>

        <aside className="card h-fit space-y-3 p-5 lg:sticky lg:top-24">
          <h2 className="font-display text-xl font-semibold">Order summary</h2>
          <ul className="space-y-1 text-sm">{cart.items.map((i) => <li key={i.id} className="flex justify-between gap-2"><span>{i.name} × {i.qty}</span><span>{inr(i.price * i.qty)}</span></li>)}</ul>
          <div className="flex gap-2 border-t border-line pt-3">
            <div className="relative flex-1"><Tag className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input className="input !py-2 pl-9 text-sm uppercase" placeholder="Coupon code" aria-label="Coupon code" value={code} onChange={(e) => { setCode(e.target.value); setCoupon(null) }} /></div>
            <button type="button" className="btn btn-outline btn-sm" onClick={applyCoupon}>Apply</button>
          </div>
          {couponMsg && <p role="alert" className="text-xs text-red-600">{couponMsg}</p>}
          {coupon && <p className="text-xs text-green-700">Coupon {coupon.code.toUpperCase()} applied.</p>}
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{inr(cart.subtotal)}</dd></div>
            {discount > 0 && <div className="flex justify-between text-green-700"><dt>Discount</dt><dd>− {inr(discount)}</dd></div>}
            <div className="flex justify-between text-muted"><dt>Tax ({st.taxPercent}%)</dt><dd>{inr(tax)}</dd></div>
            {st.platformFee > 0 && <div className="flex justify-between text-muted"><dt>Platform fee</dt><dd>{inr(st.platformFee)}</dd></div>}
            <div className="flex justify-between border-t border-line pt-2 text-base font-semibold"><dt>Total</dt><dd>{inr(total)}</dd></div>
          </dl>
          <button className="btn btn-primary w-full" disabled={busy || (!razorOk && !st.cashEnabled)}>{busy ? <Spinner /> : pay === 'razorpay' ? `Pay ${inr(total)}` : 'Confirm booking'}</button>
          <p className="text-center text-xs text-muted">The final amount is calculated and confirmed on our server. By booking you accept our <Link to="/terms" className="underline">Terms</Link> and <Link to="/refund-policy" className="underline">Refund policy</Link>.</p>
        </aside>
      </div>
    </form>
  )
}
