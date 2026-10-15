import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, CheckCircle2, Clock, Crosshair, XCircle } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { supabase } from '../../lib/supabase'
import { friendlyError } from '../../lib/errors'
import { isEmail, normalizePhone } from '../../lib/format'
import { reverseGeocodeAddress, searchPlaces, type PlaceHit } from '../../lib/geocode'
import { Field, PageHero, Skeleton, Spinner } from '../../components/ui'
import MapView from '../../components/MapView'
import MobileAccount from '../../components/MobileAccount'
import { realEmail } from '../../lib/mobileAuth'
import { HoursEditor, PhotosEditor, ServicesEditor } from './editors'
import type { Salon } from '../../lib/types'

const STEPS = ['Account', 'Salon info', 'Location', 'Services', 'Hours & photos', 'Review']
const TYPES = ['Salon', 'Parlour', 'Spa', 'Makeup studio', 'Unisex salon', 'At-home beautician', 'Bridal studio']
const FACILITIES = ['Air conditioning', 'Wi-Fi', 'Parking', 'Wheelchair access', 'Card / UPI accepted', 'Bridal room', 'Ladies only', 'Waiting area']

export function useMySalon() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['my-salon', user?.id], enabled: !!user,
    queryFn: async () => { const r = await supabase.from('salons').select('*').eq('owner_id', user!.id).order('created_at').limit(1).maybeSingle(); if (r.error) throw r.error; return r.data as Salon | null },
  })
}

export default function PartnerRegister() {
  const { user, loading, refresh, isPartner } = useAuth()
  const salonQ = useMySalon()
  const [step, setStep] = useState(0)
  const nav = useNavigate()
  const salon = salonQ.data

  useEffect(() => { if (user && step === 0 && isPartner) setStep(salon ? 2 : 1) }, [user, isPartner, salon, step])

  if (loading || (user && salonQ.isLoading)) return <div className="container-x py-12"><Skeleton className="h-64" /></div>
  if (salon && !['draft', 'rejected'].includes(salon.status)) return <Status salon={salon} onGo={() => nav('/partner/dashboard')} />

  return (
    <>
      <PageHero eyebrow="Partner registration" title="List your salon on Lushira" subtitle="Complete the steps below. Your progress is saved as you go." />
      <div className="container-x max-w-3xl py-6">
        {salon?.status === 'rejected' && <div role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-800"><strong>Your application needs changes.</strong> {salon.rejection_reason}<br />Update the details below and submit again.</div>}
        <ol className="mb-6 flex items-center gap-1 overflow-x-auto" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s} className="flex shrink-0 items-center gap-1">
              <button type="button" disabled={i > (salon ? 5 : user ? 1 : 0) || (i === 0 && !!user)} onClick={() => setStep(i)} aria-current={i === step}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${i === step ? 'bg-lush-600 text-white' : i < step ? 'bg-blush-200 text-lush-700' : 'bg-white text-muted'}`}>
                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-current text-[10px]">{i < step ? <Check className="h-3 w-3" /> : i + 1}</span>{s}</button>
              {i < STEPS.length - 1 && <span className="h-px w-3 bg-blush-300" />}
            </li>))}
        </ol>
        <div className="card p-5 sm:p-6">
          {step === 0 && <AccountStep onDone={async () => { await refresh(); setStep(1) }} />}
          {step === 1 && <InfoStep salon={salon ?? null} onDone={() => setStep(2)} />}
          {step === 2 && salon && <LocationStep salon={salon} onBack={() => setStep(1)} onDone={() => setStep(3)} />}
          {step === 3 && salon && <div><ServicesEditor salonId={salon.id} homeService={salon.home_service} /><Nav onBack={() => setStep(2)} onNext={() => setStep(4)} /></div>}
          {step === 4 && salon && <MoreStep salon={salon} onBack={() => setStep(3)} onDone={() => setStep(5)} />}
          {step === 5 && salon && <ReviewStep salon={salon} onBack={() => setStep(4)} />}
        </div>
      </div>
    </>
  )
}

const Nav = ({ onBack, onNext, nextLabel = 'Continue', busy }: { onBack?: () => void; onNext?: () => void; nextLabel?: string; busy?: boolean }) => (
  <div className="mt-6 flex justify-between gap-2 border-t border-line pt-4">
    {onBack ? <button type="button" className="btn btn-ghost" onClick={onBack}>Back</button> : <span />}
    {onNext && <button type="button" className="btn btn-primary" onClick={onNext} disabled={busy}>{busy ? <Spinner /> : nextLabel}</button>}
  </div>
)

function Status({ salon, onGo }: { salon: Salon; onGo: () => void }) {
  const m = { pending: { I: Clock, c: 'text-amber-600 bg-amber-100', t: 'Application under review', d: 'Our team is reviewing your salon. You will be notified as soon as it is approved.' }, approved: { I: CheckCircle2, c: 'text-green-600 bg-green-100', t: 'Your salon is live!', d: 'Customers can now find and book your salon.' }, suspended: { I: XCircle, c: 'text-red-600 bg-red-100', t: 'Salon suspended', d: salon.rejection_reason || 'Please contact support for details.' } }[salon.status as 'pending' | 'approved' | 'suspended']
  const I = m.I
  return (
    <div className="container-x max-w-xl py-16 text-center">
      <div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ${m.c}`}><I className="h-10 w-10" /></div>
      <h1 className="mt-4 text-3xl font-semibold">{m.t}</h1><p className="mt-2 text-muted">{salon.name} — {m.d}</p>
      <button className="btn btn-primary mt-6" onClick={onGo}>Go to dashboard</button>
    </div>
  )
}

function AccountStep({ onDone }: { onDone: () => Promise<void> }) {
  const toast = useToast()
  const [mode, setMode] = useState<'signup' | 'login'>('signup')
  const authed = async () => {
    const p = await supabase.rpc('become_partner')
    if (p.error) return toast.error(friendlyError(p.error))
    await onDone()
  }
  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl font-semibold">{mode === 'signup' ? 'Create your partner account' : 'Log in to continue'}</h2>
      <MobileAccount mode={mode} onAuthed={authed} />
      <p className="text-center text-sm text-muted">{mode === 'signup' ? 'Already registered?' : 'New partner?'} <button type="button" className="font-semibold text-lush-600" onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}>{mode === 'signup' ? 'Log in' : 'Create account'}</button></p>
      <p className="text-center text-xs text-muted">By continuing you agree to our <Link className="underline" to="/terms">Terms</Link> and <Link className="underline" to="/privacy">Privacy Policy</Link>.</p>
    </div>
  )
}

function InfoStep({ salon, onDone }: { salon: Salon | null; onDone: () => void }) {
  const { user, profile, refresh } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [f, setF] = useState({ name: salon?.name ?? '', business_type: salon?.business_type ?? 'Salon', description: salon?.description ?? '', contact_phone: salon?.contact_phone ?? '', contact_email: salon?.contact_email ?? realEmail(user?.email), home_service: salon?.home_service ?? false, capacity: String(salon?.concurrent_capacity ?? 1), appointment_required: salon?.appointment_required ?? true, walk_in: salon?.walk_in ?? false, owner_name: profile?.full_name ?? '' })
  const [err, setErr] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const er: Record<string, string> = {}
    if (f.name.trim().length < 2) er.name = 'Enter your salon / business name'
    const ph = normalizePhone(f.contact_phone)
    if (!ph) er.phone = 'Enter a valid mobile number'
    if (f.contact_email && !isEmail(f.contact_email)) er.email = 'Enter a valid email'
    const cap = Number(f.capacity)
    if (!(cap >= 1 && cap <= 50)) er.cap = 'Between 1 and 50'
    if (f.owner_name.trim().length < 2) er.owner = 'Enter the owner name'
    setErr(er)
    if (Object.keys(er).length) return
    setBusy(true)
    const row = { name: f.name.trim(), business_type: f.business_type, description: f.description.trim() || null, contact_phone: ph, contact_email: f.contact_email.trim() || null, home_service: f.home_service, concurrent_capacity: cap, appointment_required: f.appointment_required, walk_in: f.walk_in }
    const r = salon ? await supabase.from('salons').update(row).eq('id', salon.id).select('id').single() : await supabase.from('salons').insert({ ...row, owner_id: user!.id }).select('id').single()
    if (r.error) { setBusy(false); return toast.error(friendlyError(r.error)) }
    const p = await supabase.from('salon_private').upsert({ salon_id: r.data.id, owner_name: f.owner_name.trim(), owner_phone: ph, owner_email: realEmail(user?.email) || null })
    setBusy(false)
    if (p.error) return toast.error(friendlyError(p.error))
    await qc.invalidateQueries({ queryKey: ['my-salon'] }); await refresh(); onDone()
  }
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
      <h2 className="font-display text-xl font-semibold sm:col-span-2">Tell us about your business</h2>
      <Field label="Salon / business name" required error={err.name}><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Business type"><select className="input" value={f.business_type} onChange={(e) => setF({ ...f, business_type: e.target.value })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
      <Field label="Owner name" required error={err.owner}><input className="input" value={f.owner_name} onChange={(e) => setF({ ...f, owner_name: e.target.value })} /></Field>
      <Field label="Contact mobile" required error={err.phone} hint="Shown to customers with confirmed bookings."><input className="input" inputMode="tel" value={f.contact_phone} onChange={(e) => setF({ ...f, contact_phone: e.target.value })} /></Field>
      <Field label="Contact email" error={err.email}><input className="input" type="email" value={f.contact_email} onChange={(e) => setF({ ...f, contact_email: e.target.value })} /></Field>
      <Field label="Customers served at the same time" error={err.cap} hint="Chairs / beauticians that can work in parallel."><input className="input" inputMode="numeric" value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value.replace(/\D/g, '') })} /></Field>
      <div className="sm:col-span-2"><Field label="About your salon"><textarea className="input min-h-24" maxLength={500} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Experience, specialities, what makes you special…" /></Field></div>
      <div className="flex flex-wrap gap-5 text-sm sm:col-span-2">
        <label className="flex items-center gap-2"><input type="checkbox" className="accent-lush-600" checked={f.home_service} onChange={(e) => setF({ ...f, home_service: e.target.checked })} />We offer at-home service</label>
        <label className="flex items-center gap-2"><input type="checkbox" className="accent-lush-600" checked={f.appointment_required} onChange={(e) => setF({ ...f, appointment_required: e.target.checked })} />Appointment required</label>
        <label className="flex items-center gap-2"><input type="checkbox" className="accent-lush-600" checked={f.walk_in} onChange={(e) => setF({ ...f, walk_in: e.target.checked })} />Walk-ins welcome</label>
      </div>
      <div className="sm:col-span-2"><Nav onNext={() => void submit(new Event('submit') as unknown as FormEvent)} busy={busy} nextLabel="Save & continue" /></div>
    </form>
  )
}

function LocationStep({ salon, onBack, onDone }: { salon: Salon; onBack: () => void; onDone: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [f, setF] = useState({ address_line: salon.address_line ?? '', landmark: salon.landmark ?? '', area: salon.area ?? '', city: salon.city ?? '', state: salon.state ?? 'Bihar', pin_code: salon.pin_code ?? '' })
  const [pt, setPt] = useState<{ lat: number; lng: number } | null>(salon.lat != null && salon.lng != null ? { lat: salon.lat, lng: salon.lng } : null)
  const [q, setQ] = useState(''); const [hits, setHits] = useState<PlaceHit[]>([]); const [busy, setBusy] = useState(false); const [geo, setGeo] = useState(false)
  const [err, setErr] = useState('')
  const [filled, setFilled] = useState(false)
  // Pin a point and auto-fill the (editable) address fields from it.
  const pinAt = async (lat: number, lng: number) => {
    setPt({ lat, lng })
    const a = await reverseGeocodeAddress(lat, lng)
    if (!a) return toast.info('Location pinned. Could not read the address automatically — please type it.')
    setF((x) => ({ ...x, address_line: a.line || x.address_line, landmark: a.landmark || x.landmark, area: a.area || x.area, city: a.city || x.city, state: a.state || x.state, pin_code: a.pin || x.pin_code }))
    setFilled(true); setErr('')
  }
  const gps = () => {
    if (!navigator.geolocation) return toast.error('Location is not supported on this device.')
    setGeo(true)
    navigator.geolocation.getCurrentPosition(async (p) => { await pinAt(p.coords.latitude, p.coords.longitude); setGeo(false) },
      () => { setGeo(false); toast.error('Could not get your location. Search for it instead.') }, { enableHighAccuracy: true, timeout: 15000 })
  }
  const save = async () => {
    setErr('')
    if (f.address_line.trim().length < 3) return setErr('Enter the street address.')
    if (!f.city.trim()) return setErr('Enter the city.')
    if (!/^\d{6}$/.test(f.pin_code)) return setErr('Enter a 6-digit PIN code.')
    if (!pt) return setErr('Pin your salon on the map using “Use current location” or search.')
    setBusy(true)
    const r = await supabase.from('salons').update({ address_line: f.address_line.trim(), landmark: f.landmark.trim() || null, area: f.area.trim() || null, city: f.city.trim(), state: f.state.trim() || null, pin_code: f.pin_code, location: `SRID=4326;POINT(${pt.lng} ${pt.lat})` }).eq('id', salon.id)
    setBusy(false)
    if (r.error) return toast.error(friendlyError(r.error))
    await qc.invalidateQueries({ queryKey: ['my-salon'] }); onDone()
  }
  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl font-semibold">Where is your salon?</h2>
      <Field label="Street address" required><input className="input" value={f.address_line} onChange={(e) => setF({ ...f, address_line: e.target.value })} autoComplete="address-line1" /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Landmark"><input className="input" value={f.landmark} onChange={(e) => setF({ ...f, landmark: e.target.value })} /></Field>
        <Field label="Area / locality"><input className="input" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} placeholder="e.g. Padora" /></Field>
        <Field label="City / town" required><input className="input" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
        <Field label="State"><input className="input" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} /></Field>
        <Field label="PIN code" required><input className="input" inputMode="numeric" maxLength={6} value={f.pin_code} onChange={(e) => setF({ ...f, pin_code: e.target.value.replace(/\D/g, '') })} /></Field>
      </div>
      <div className="rounded-xl bg-blush-100 p-3">
        <p className="text-sm font-medium">Pin your exact location</p><p className="text-xs text-muted">Customers find you by distance, so this must be accurate. Standing at your salon? Use your current location.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="btn btn-outline btn-sm" onClick={gps} disabled={geo}><Crosshair className="h-4 w-4" />{geo ? 'Locating…' : 'Use current location'}</button>
          <div className="flex min-w-[200px] flex-1 gap-2"><input className="input !py-1.5 text-sm" placeholder="Search address or landmark" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void searchPlaces(q).then(setHits).catch(() => toast.error('Search failed.')) } }} /><button type="button" className="btn btn-dark btn-sm" onClick={() => void searchPlaces(q).then(setHits).catch(() => toast.error('Search failed.'))}>Search</button></div>
        </div>
        {hits.length > 0 && <ul className="mt-2 divide-y divide-line rounded-xl bg-white text-sm">{hits.map((h, i) => <li key={i}><button type="button" className="w-full px-3 py-2 text-left hover:bg-blush-50" onClick={() => { void pinAt(h.lat, h.lng); setHits([]); setQ(h.label) }}>{h.label}</button></li>)}</ul>}
        {filled && <p className="mt-2 text-xs font-medium text-green-700">Address filled from your location. Please check it and edit anything that is not correct.</p>}
        {pt && <div className="mt-3 overflow-hidden rounded-xl"><MapView center={[pt.lat, pt.lng]} zoom={16} height={200} markers={[{ id: 's', lat: pt.lat, lng: pt.lng, label: salon.name }]} /></div>}
      </div>
      {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
      <Nav onBack={onBack} onNext={() => void save()} busy={busy} nextLabel="Save & continue" />
    </div>
  )
}

function MoreStep({ salon, onBack, onDone }: { salon: Salon; onBack: () => void; onDone: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [fac, setFac] = useState<Record<string, boolean>>(salon.facilities ?? {})
  const [policy, setPolicy] = useState(salon.cancellation_policy ?? '')
  const [busy, setBusy] = useState(false)
  const next = async () => {
    setBusy(true)
    const r = await supabase.from('salons').update({ facilities: fac, cancellation_policy: policy.trim() || null }).eq('id', salon.id)
    setBusy(false)
    if (r.error) return toast.error(friendlyError(r.error))
    await qc.invalidateQueries({ queryKey: ['my-salon'] }); onDone()
  }
  return (
    <div className="space-y-6">
      <HoursEditor salonId={salon.id} />
      <div><h3 className="mb-2 font-display text-lg font-semibold">Facilities</h3>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">{FACILITIES.map((f) => <label key={f} className="flex items-center gap-2"><input type="checkbox" className="accent-lush-600" checked={!!fac[f]} onChange={(e) => setFac({ ...fac, [f]: e.target.checked })} />{f}</label>)}</div></div>
      <Field label="Your cancellation policy (optional)"><textarea className="input min-h-20" maxLength={400} value={policy} onChange={(e) => setPolicy(e.target.value)} placeholder="e.g. Please inform us 4 hours before to reschedule." /></Field>
      <PhotosEditor salonId={salon.id} logo={salon.logo_url} cover={salon.cover_url} onChanged={() => void qc.invalidateQueries({ queryKey: ['my-salon'] })} />
      <Nav onBack={onBack} onNext={() => void next()} busy={busy} nextLabel="Save & continue" />
    </div>
  )
}

function ReviewStep({ salon, onBack }: { salon: Salon; onBack: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const counts = useQuery({
    queryKey: ['review-counts', salon.id],
    queryFn: async () => {
      const [s, h] = await Promise.all([supabase.from('salon_services').select('id', { count: 'exact', head: true }).eq('salon_id', salon.id), supabase.from('salon_business_hours').select('id', { count: 'exact', head: true }).eq('salon_id', salon.id)])
      return { services: s.count ?? 0, hours: h.count ?? 0 }
    },
  })
  const checks = [
    ['Business details', !!salon.name && !!salon.contact_phone], ['Location pinned', salon.lat != null], ['Address', !!salon.address_line && !!salon.pin_code],
    ['At least one service', (counts.data?.services ?? 0) > 0], ['Business hours', (counts.data?.hours ?? 0) > 0], ['Logo or cover photo (recommended)', !!(salon.logo_url || salon.cover_url)],
  ] as const
  const required = checks.slice(0, 5).every(([, ok]) => ok)
  const submit = async () => {
    setBusy(true)
    const r = await supabase.rpc('submit_salon_for_review', { p_salon_id: salon.id })
    setBusy(false)
    if (r.error) return toast.error(friendlyError(r.error))
    toast.success('Application submitted!'); await qc.invalidateQueries({ queryKey: ['my-salon'] })
  }
  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl font-semibold">Review &amp; submit</h2>
      <p className="text-sm text-muted">{salon.name} · {[salon.area, salon.city].filter(Boolean).join(', ')}</p>
      <ul className="space-y-2">{checks.map(([l, ok]) => <li key={l} className="flex items-center gap-2 text-sm">{ok ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <XCircle className="h-5 w-5 text-red-400" />}{l}</li>)}</ul>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 accent-lush-600" checked={agree} onChange={(e) => setAgree(e.target.checked)} />I confirm the details are accurate and I agree to the <Link to="/terms" className="underline">Terms</Link> for partners.</label>
      <Nav onBack={onBack} onNext={() => void submit()} busy={busy || !required || !agree} nextLabel="Submit for review" />
      {!required && <p className="text-xs text-red-600">Complete the required items above to submit.</p>}
    </div>
  )
}
