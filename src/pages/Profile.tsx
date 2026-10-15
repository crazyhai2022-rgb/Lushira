import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Download, Heart, LogOut, MapPin, Plus, ShieldCheck, Trash2, User } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { usePlace } from '../context/LocationContext'
import { realEmail } from '../lib/mobileAuth'
import { supabase, publicUrl } from '../lib/supabase'
import { friendlyError } from '../lib/errors'
import { fmtDateTime } from '../lib/format'
import { EmptyState, ErrorState, Field, Modal, PageHero, Skeleton } from '../components/ui'

type Tab = 'details' | 'addresses' | 'favorites' | 'notifications' | 'privacy'
interface Addr { id: string; label: string; line1: string; landmark: string | null; area: string | null; city: string | null; pin_code: string | null; is_default: boolean }

export default function Profile() {
  const { user, profile, roles, isAdmin, isPartner, refresh, signOut } = useAuth()
  const [tab, setTab] = useState<Tab>('details')
  const nav = useNavigate()
  const tabs: { k: Tab; l: string; i: typeof User }[] = [
    { k: 'details', l: 'My details', i: User }, { k: 'addresses', l: 'Addresses', i: MapPin }, { k: 'favorites', l: 'Favourites', i: Heart },
    { k: 'notifications', l: 'Notifications', i: Bell }, { k: 'privacy', l: 'Privacy', i: ShieldCheck },
  ]
  return (
    <>
      <PageHero eyebrow="Account" title={profile?.full_name || 'My profile'} subtitle={realEmail(user?.email) || profile?.phone || ''} />
      <div className="container-x grid gap-6 py-6 md:grid-cols-[220px_1fr]">
        <nav className="flex gap-2 overflow-x-auto md:flex-col" aria-label="Profile sections">
          {tabs.map((t) => <button key={t.k} onClick={() => setTab(t.k)} aria-current={tab === t.k} className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium ${tab === t.k ? 'bg-lush-600 text-white' : 'bg-white text-plum-800 hover:bg-blush-100'}`}><t.i className="h-4 w-4" />{t.l}</button>)}
          <hr className="hidden border-line md:block" />
          {isPartner && <Link to="/partner/dashboard" className="shrink-0 rounded-xl bg-blush-100 px-4 py-2.5 text-sm font-medium">Partner dashboard</Link>}
          {isAdmin && <Link to="/admin" className="shrink-0 rounded-xl bg-blush-100 px-4 py-2.5 text-sm font-medium">Admin dashboard</Link>}
          {!isPartner && <Link to="/partner/register" className="shrink-0 rounded-xl bg-blush-100 px-4 py-2.5 text-sm font-medium">List my salon</Link>}
          <button onClick={async () => { await signOut(); nav('/') }} className="flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"><LogOut className="h-4 w-4" />Log out</button>
        </nav>
        <div>
          {tab === 'details' && <Details />}
          {tab === 'addresses' && <Addresses />}
          {tab === 'favorites' && <Favorites />}
          {tab === 'notifications' && <Notifications />}
          {tab === 'privacy' && <Privacy onChanged={refresh} />}
          <p className="sr-only">{roles.join(',')}</p>
        </div>
      </div>
    </>
  )
}

function Details() {
  const { user, profile, refresh } = useAuth()
  const toast = useToast()
  const [name, setName] = useState(profile?.full_name ?? '')
  const [busy, setBusy] = useState(false)
  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (name.trim().length < 2) return toast.error('Enter your full name.')
    setBusy(true)
    const r = await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', user!.id)
    setBusy(false)
    if (r.error) return toast.error(friendlyError(r.error))
    await refresh(); toast.success('Profile updated.')
  }
  return (
    <form onSubmit={save} className="card max-w-lg space-y-4 p-5">
      <Field label="Full name" required><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
      <Field label="Email"><input className="input bg-blush-50" value={realEmail(user?.email)} readOnly placeholder="Not added" /></Field>
      <Field label="Mobile" hint={profile?.phone_verified ? 'Verified' : 'Add a mobile number when you book; verified login by mobile will be enabled soon.'}><input className="input bg-blush-50" value={profile?.phone ?? ''} readOnly placeholder="Not added" /></Field>
      <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
    </form>
  )
}

function Addresses() {
  const { user } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ label: 'Home', line1: '', landmark: '', area: '', city: '', pin_code: '' })
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const q = useQuery({ queryKey: ['addresses'], queryFn: async () => { const r = await supabase.from('customer_addresses').select('id,label,line1,landmark,area,city,pin_code,is_default').order('created_at', { ascending: false }); if (r.error) throw r.error; return r.data as Addr[] } })
  const add = useMutation({
    mutationFn: async () => {
      if (f.line1.trim().length < 3) throw new Error('Enter the street address.')
      if (f.pin_code && !/^\d{6}$/.test(f.pin_code)) throw new Error('PIN code must be 6 digits.')
      const r = await supabase.from('customer_addresses').insert({ user_id: user!.id, label: f.label.trim() || 'Home', line1: f.line1.trim(), landmark: f.landmark || null, area: f.area || null, city: f.city || null, pin_code: f.pin_code || null, location: coords ? `SRID=4326;POINT(${coords.lng} ${coords.lat})` : null })
      if (r.error) throw r.error
    },
    onSuccess: () => { setOpen(false); setF({ label: 'Home', line1: '', landmark: '', area: '', city: '', pin_code: '' }); setCoords(null); void qc.invalidateQueries({ queryKey: ['addresses'] }); toast.success('Address saved.') },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const del = useMutation({
    mutationFn: async (id: string) => { const r = await supabase.from('customer_addresses').delete().eq('id', id); if (r.error) throw r.error },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['addresses'] }), onError: (e) => toast.error(friendlyError(e)),
  })
  const gps = () => navigator.geolocation?.getCurrentPosition((p) => { setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }); toast.success('Location captured.') }, () => toast.error('Could not get your location.'), { timeout: 15000 })
  return (
    <div>
      <div className="mb-3 flex items-center justify-between"><h2 className="font-display text-xl font-semibold">Saved addresses</h2><button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Add</button></div>
      {q.isLoading ? <Skeleton className="h-24" /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : (q.data?.length ?? 0) === 0 ? <EmptyState icon={<MapPin className="h-6 w-6" />} title="No saved addresses" text="Save your address for faster at-home bookings." /> : (
        <ul className="grid gap-3 sm:grid-cols-2">{q.data!.map((a) => (
          <li key={a.id} className="card flex items-start justify-between gap-2 p-4"><div><p className="font-semibold">{a.label}</p><p className="text-sm text-muted">{[a.line1, a.landmark, a.area, a.city, a.pin_code].filter(Boolean).join(', ')}</p></div>
            <button aria-label="Delete address" className="text-muted hover:text-red-600" onClick={() => { if (window.confirm('Delete this address?')) del.mutate(a.id) }}><Trash2 className="h-4 w-4" /></button></li>))}</ul>)}
      <Modal open={open} onClose={() => setOpen(false)} title="Add address">
        <div className="space-y-3">
          <Field label="Label"><input className="input" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} maxLength={40} /></Field>
          <Field label="House / street" required><input className="input" value={f.line1} onChange={(e) => setF({ ...f, line1: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Landmark"><input className="input" value={f.landmark} onChange={(e) => setF({ ...f, landmark: e.target.value })} /></Field>
            <Field label="Area"><input className="input" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} /></Field>
            <Field label="City"><input className="input" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
            <Field label="PIN code"><input className="input" inputMode="numeric" maxLength={6} value={f.pin_code} onChange={(e) => setF({ ...f, pin_code: e.target.value.replace(/\D/g, '') })} /></Field>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={gps}>{coords ? 'Location captured ✓' : 'Attach my current location'}</button>
          <div className="flex justify-end gap-2"><button className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={add.isPending} onClick={() => add.mutate()}>Save</button></div>
        </div>
      </Modal>
    </div>
  )
}

function Favorites() {
  const q = useQuery({ queryKey: ['favorites'], queryFn: async () => { const r = await supabase.from('favorites').select('salon_id,salons(id,name,slug,logo_url,area,city)').order('created_at', { ascending: false }); if (r.error) throw r.error; return (r.data ?? []) as unknown as { salon_id: string; salons: { name: string; slug: string; logo_url: string | null; area: string | null; city: string | null } | null }[] } })
  if (q.isLoading) return <Skeleton className="h-24" />
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />
  const rows = (q.data ?? []).filter((x) => x.salons)
  if (!rows.length) return <EmptyState icon={<Heart className="h-6 w-6" />} title="No favourites yet" text="Tap the heart on a salon to save it here." action={<Link to="/salons" className="btn btn-primary btn-sm">Explore salons</Link>} />
  return <ul className="grid gap-3 sm:grid-cols-2">{rows.map((r) => (
    <li key={r.salon_id}><Link to={`/salon/${r.salons!.slug}`} className="card flex items-center gap-3 p-3 hover:shadow-md"><img src={publicUrl(r.salons!.logo_url) ?? '/icons/icon-192.png'} alt="" className="h-14 w-14 rounded-xl object-cover" /><div><p className="font-semibold">{r.salons!.name}</p><p className="text-xs text-muted">{[r.salons!.area, r.salons!.city].filter(Boolean).join(', ')}</p></div></Link></li>))}</ul>
}

function Notifications() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['notifications'], queryFn: async () => { const r = await supabase.from('notifications').select('id,title,body,booking_id,read_at,created_at').order('created_at', { ascending: false }).limit(50); if (r.error) throw r.error; return r.data as { id: string; title: string; body: string | null; booking_id: string | null; read_at: string | null; created_at: string }[] } })
  const read = useMutation({ mutationFn: async () => { await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null) }, onSuccess: () => void qc.invalidateQueries({ queryKey: ['notifications'] }) })
  if (q.isLoading) return <Skeleton className="h-24" />
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />
  if (!q.data?.length) return <EmptyState icon={<Bell className="h-6 w-6" />} title="No notifications" text="Booking updates will appear here." />
  return (
    <div><button className="btn btn-outline btn-sm mb-3" onClick={() => read.mutate()}>Mark all as read</button>
      <ul className="space-y-2">{q.data.map((n) => (
        <li key={n.id} className={`card p-3 ${n.read_at ? '' : 'border-lush-400 bg-blush-50'}`}>
          <p className="text-sm font-semibold">{n.title}</p>{n.body && <p className="text-sm text-muted">{n.body}</p>}
          <p className="mt-1 text-xs text-muted">{fmtDateTime(n.created_at)} {n.booking_id && <Link className="ml-2 font-semibold text-lush-600" to={`/track/${n.booking_id}`}>View</Link>}</p></li>))}</ul></div>
  )
}

function Privacy({ onChanged }: { onChanged: () => Promise<void> }) {
  const { user, profile, signOut } = useAuth()
  const toast = useToast()
  const loc = usePlace()
  const nav = useNavigate()
  const [confirmDel, setConfirmDel] = useState(false)
  const set = async (patch: Record<string, unknown>) => {
    const r = await supabase.from('profiles').update(patch).eq('id', user!.id)
    if (r.error) return toast.error(friendlyError(r.error))
    await onChanged()
  }
  const exportData = async () => {
    const r = await supabase.rpc('export_my_data')
    if (r.error) return toast.error(friendlyError(r.error))
    const url = URL.createObjectURL(new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = 'lushira-my-data.json'; a.click(); URL.revokeObjectURL(url)
  }
  const requestDeletion = async () => {
    await set({ deletion_requested_at: new Date().toISOString() })
    setConfirmDel(false); toast.success('Deletion requested. Our team will process it and confirm by email.'); await signOut(); nav('/')
  }
  return (
    <div className="card max-w-xl space-y-5 p-5">
      <label className="flex items-start justify-between gap-4"><span><span className="block text-sm font-medium">Offers &amp; updates</span><span className="text-xs text-muted">Receive occasional promotions. Booking messages are always sent.</span></span>
        <input type="checkbox" className="mt-1 h-5 w-5 accent-lush-600" checked={!!profile?.marketing_opt_in} onChange={(e) => void set({ marketing_opt_in: e.target.checked })} /></label>
      <label className="flex items-start justify-between gap-4"><span><span className="block text-sm font-medium">Remember my location choice</span><span className="text-xs text-muted">Location is only used to find salons near you. Turn off to be asked every time.</span></span>
        <input type="checkbox" className="mt-1 h-5 w-5 accent-lush-600" checked={!!profile?.location_consent} onChange={(e) => { void set({ location_consent: e.target.checked }); if (!e.target.checked) loc.clear() }} /></label>
      <div className="border-t border-line pt-4"><button className="btn btn-outline btn-sm" onClick={exportData}><Download className="h-4 w-4" />Download my data</button></div>
      <div className="border-t border-line pt-4">
        {profile?.deletion_requested_at ? <p className="text-sm text-amber-700">Deletion requested on {fmtDateTime(profile.deletion_requested_at)}.</p> :
          <button className="btn btn-ghost btn-sm text-red-600" onClick={() => setConfirmDel(true)}><Trash2 className="h-4 w-4" />Request account deletion</button>}
        <p className="mt-1 text-xs text-muted">Bookings and payment records may be retained as required by law.</p>
      </div>
      <Modal open={confirmDel} onClose={() => setConfirmDel(false)} title="Delete your account?">
        <p className="text-sm text-muted">We will delete your personal data after any open bookings are completed. You will be logged out now.</p>
        <div className="mt-4 flex justify-end gap-2"><button className="btn btn-ghost" onClick={() => setConfirmDel(false)}>Keep account</button><button className="btn btn-primary" onClick={() => void requestDeletion()}>Request deletion</button></div>
      </Modal>
    </div>
  )
}
