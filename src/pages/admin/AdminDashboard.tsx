import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, Check, Eye, EyeOff, Flag, Star, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { friendlyError } from '../../lib/errors'
import { fmtDateTime, inr, statusLabel } from '../../lib/format'
import { useToast } from '../../context/ToastContext'
import { EmptyState, ErrorState, Modal, PageHero, Skeleton } from '../../components/ui'
import { StatusBadge } from '../../components/booking'
import { Crud } from './Crud'
import type { Booking } from '../../lib/types'

type Tab = 'overview' | 'salons' | 'bookings' | 'payments' | 'catalog' | 'brands' | 'marketing' | 'reviews' | 'support' | 'settings'
const TABS: [Tab, string][] = [['overview', 'Overview'], ['salons', 'Salons'], ['bookings', 'Bookings'], ['payments', 'Payments & refunds'], ['catalog', 'Categories'], ['brands', 'Brands'], ['marketing', 'Coupons & banners'], ['reviews', 'Reviews'], ['support', 'Support'], ['settings', 'Settings']]

export default function AdminDashboard() {
  const [tab, setTab] = useState<Tab>('overview')
  return (
    <>
      <PageHero eyebrow="Admin" title="Lushira control panel" />
      <div className="container-x py-5">
        <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`chip shrink-0 !px-4 !py-2 text-sm ${tab === k ? 'chip-active' : ''}`}>{l}</button>)}</div>
        {tab === 'overview' && <Overview go={setTab} />}
        {tab === 'salons' && <Salons />}
        {tab === 'bookings' && <Bookings />}
        {tab === 'payments' && <Payments />}
        {tab === 'catalog' && <Crud table="service_categories" title="Categories" order="sort_order" defaults={{ is_active: true, sort_order: 0 }}
          fields={[{ key: 'name', label: 'Name', required: true }, { key: 'slug', label: 'Slug', required: true, hint: 'lowercase-with-dashes; used in URLs and image names' }, { key: 'description', label: 'Description', type: 'textarea' }, { key: 'image_url', label: 'Image URL' }, { key: 'sort_order', label: 'Sort order', type: 'number' }, { key: 'is_active', label: 'Active', type: 'bool' }]}
          columns={(r) => <><p className="font-medium">{String(r.name)}{!r.is_active && <span className="chip ml-2">Hidden</span>}</p><p className="text-xs text-muted">/{String(r.slug)}</p></>} />}
        {tab === 'brands' && <Brands />}
        {tab === 'marketing' && <Marketing />}
        {tab === 'reviews' && <Reviews />}
        {tab === 'support' && <Support />}
        {tab === 'settings' && <Settings />}
      </div>
    </>
  )
}

function useCount(table: string, col?: string, val?: string) {
  return useQuery({
    queryKey: ['count', table, col, val],
    queryFn: async () => {
      const base = supabase.from(table).select('id', { count: 'exact', head: true })
      const r = await (col ? base.eq(col, val as string) : base)
      return r.count ?? 0
    },
  })
}
function Overview({ go }: { go: (t: Tab) => void }) {
  const pending = useCount('salons', 'status', 'pending')
  const approved = useCount('salons', 'status', 'approved')
  const bookings = useCount('bookings')
  const tickets = useCount('support_tickets', 'status', 'open')
  const refunds = useCount('refunds', 'status', 'requested')
  const cards: [string, number | undefined, Tab][] = [['Salons awaiting approval', pending.data, 'salons'], ['Live salons', approved.data, 'salons'], ['Total bookings', bookings.data, 'bookings'], ['Refund requests', refunds.data, 'payments'], ['Open support tickets', tickets.data, 'support']]
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{cards.map(([l, v, t]) => <button key={l} onClick={() => go(t)} className="card p-4 text-left hover:shadow-md"><p className="font-display text-3xl font-semibold">{v ?? '…'}</p><p className="text-xs text-muted">{l}</p></button>)}</div>
}

interface SalonRow { id: string; name: string; status: string; area: string | null; city: string | null; contact_phone: string | null; contact_email: string | null; created_at: string; featured: boolean; rejection_reason: string | null; address_line: string | null }
function Salons() {
  const qc = useQueryClient()
  const toast = useToast()
  const [filter, setFilter] = useState('pending')
  const [dec, setDec] = useState<{ id: string; decision: 'rejected' | 'suspended'; name: string } | null>(null)
  const [reason, setReason] = useState('')
  const q = useQuery({ queryKey: ['a-salons'], queryFn: async () => { const r = await supabase.from('salons').select('id,name,status,area,city,contact_phone,contact_email,created_at,featured,rejection_reason,address_line').order('created_at', { ascending: false }).limit(200); if (r.error) throw r.error; return r.data as SalonRow[] } })
  const review = useMutation({
    mutationFn: async (p: { id: string; decision: string; reason?: string }) => { const r = await supabase.rpc('admin_review_salon', { p_salon_id: p.id, p_decision: p.decision, p_reason: p.reason ?? null }); if (r.error) throw r.error },
    onSuccess: () => { setDec(null); setReason(''); toast.success('Updated.'); void qc.invalidateQueries({ queryKey: ['a-salons'] }) }, onError: (e) => toast.error(friendlyError(e)),
  })
  const feature = useMutation({ mutationFn: async (s: SalonRow) => { const r = await supabase.from('salons').update({ featured: !s.featured }).eq('id', s.id); if (r.error) throw r.error }, onSuccess: () => void qc.invalidateQueries({ queryKey: ['a-salons'] }), onError: (e) => toast.error(friendlyError(e)) })
  const list = (q.data ?? []).filter((s) => filter === 'all' || s.status === filter)
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">{['pending', 'approved', 'rejected', 'suspended', 'draft', 'all'].map((s) => <button key={s} onClick={() => setFilter(s)} className={`chip !px-3 !py-1.5 capitalize ${filter === s ? 'chip-active' : ''}`}>{s}{s !== 'all' && ` (${(q.data ?? []).filter((x) => x.status === s).length})`}</button>)}</div>
      {q.isLoading ? <Skeleton className="h-24" /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : !list.length ? <EmptyState title="No salons in this view" /> : (
        <ul className="space-y-3">{list.map((s) => (
          <li key={s.id} className="card p-4 text-sm"><div className="flex flex-wrap items-start justify-between gap-2">
            <div><p className="font-semibold">{s.name} {s.featured && <Star className="inline h-4 w-4 fill-amber-400 text-amber-400" />}</p><p className="text-muted">{[s.address_line, s.area, s.city].filter(Boolean).join(', ')}</p><p className="text-xs text-muted">{s.contact_phone} · {s.contact_email} · applied {fmtDateTime(s.created_at)}</p>{s.rejection_reason && <p className="text-xs text-red-600">Reason: {s.rejection_reason}</p>}</div>
            <span className="chip capitalize">{s.status}</span></div>
            <div className="mt-3 flex flex-wrap gap-2">
              {['pending', 'rejected', 'suspended'].includes(s.status) && <button className="btn btn-primary btn-sm" disabled={review.isPending} onClick={() => review.mutate({ id: s.id, decision: 'approved' })}><Check className="h-4 w-4" />Approve</button>}
              {['pending', 'approved'].includes(s.status) && <button className="btn btn-outline btn-sm" onClick={() => setDec({ id: s.id, decision: 'rejected', name: s.name })}><X className="h-4 w-4" />Reject</button>}
              {s.status === 'approved' && <button className="btn btn-ghost btn-sm" onClick={() => setDec({ id: s.id, decision: 'suspended', name: s.name })}>Suspend</button>}
              {s.status === 'approved' && <button className="btn btn-ghost btn-sm" onClick={() => feature.mutate(s)}>{s.featured ? 'Unfeature' : 'Feature'}</button>}
            </div></li>))}</ul>)}
      <Modal open={!!dec} onClose={() => setDec(null)} title={`${dec?.decision === 'rejected' ? 'Reject' : 'Suspend'} ${dec?.name ?? ''}`}>
        <label className="block"><span className="label">Reason (shown to the owner)</span><textarea className="input min-h-24" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        <div className="mt-4 flex justify-end gap-2"><button className="btn btn-ghost" onClick={() => setDec(null)}>Cancel</button><button className="btn btn-primary" disabled={reason.trim().length < 3 || review.isPending} onClick={() => review.mutate({ id: dec!.id, decision: dec!.decision, reason: reason.trim() })}>Confirm</button></div>
      </Modal>
    </div>
  )
}

function Bookings() {
  const [s, setS] = useState('')
  const q = useQuery({ queryKey: ['a-bookings'], queryFn: async () => { const r = await supabase.from('bookings').select('id,reference,status,scheduled_start,customer_name,customer_phone,total_inr,payment_method,payment_status,mode,salons(name)').order('created_at', { ascending: false }).limit(200); if (r.error) throw r.error; return r.data as unknown as (Booking & { salons: { name: string } })[] } })
  const list = (q.data ?? []).filter((b) => !s || b.status === s)
  return (
    <div>
      <select className="input mb-3 !w-auto" value={s} onChange={(e) => setS(e.target.value)} aria-label="Status filter"><option value="">All statuses</option>{Object.entries(statusLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      {q.isLoading ? <Skeleton className="h-24" /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : !list.length ? <EmptyState title="No bookings" /> : (
        <div className="card overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-blush-50 text-xs text-muted"><tr>{['Ref', 'Salon', 'Customer', 'When', 'Total', 'Payment', 'Status'].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">{list.map((b) => <tr key={b.id}><td className="px-3 py-2 font-mono text-xs">{b.reference}</td><td className="px-3 py-2">{b.salons?.name}</td><td className="px-3 py-2">{b.customer_name}<br /><span className="text-xs text-muted">{b.customer_phone}</span></td><td className="px-3 py-2">{fmtDateTime(b.scheduled_start)}</td><td className="px-3 py-2">{inr(b.total_inr)}</td><td className="px-3 py-2 text-xs">{b.payment_method} · {b.payment_status}</td><td className="px-3 py-2"><StatusBadge status={b.status} /></td></tr>)}</tbody></table></div>)}
    </div>
  )
}

function Payments() {
  const qc = useQueryClient()
  const toast = useToast()
  const pay = useQuery({ queryKey: ['a-payments'], queryFn: async () => { const r = await supabase.from('payments').select('id,booking_id,method,amount_inr,status,razorpay_payment_id,created_at,bookings(reference)').order('created_at', { ascending: false }).limit(100); if (r.error) throw r.error; return r.data as unknown as { id: string; method: string; amount_inr: number; status: string; razorpay_payment_id: string | null; created_at: string; bookings: { reference: string } | null }[] } })
  const ref = useQuery({ queryKey: ['a-refunds'], queryFn: async () => { const r = await supabase.from('refunds').select('id,amount_inr,reason,status,created_at,razorpay_refund_id,bookings(reference)').order('created_at', { ascending: false }).limit(100); if (r.error) throw r.error; return r.data as unknown as { id: string; amount_inr: number; reason: string | null; status: string; created_at: string; razorpay_refund_id: string | null; bookings: { reference: string } | null }[] } })
  const process = useMutation({
    mutationFn: async (p: { id: string; action: 'approve' | 'reject' }) => { const r = await supabase.functions.invoke('razorpay-refund', { body: { refund_id: p.id, action: p.action } }); if (r.error || r.data?.error) throw new Error(r.data?.error || 'Refund processing is not available. Check Razorpay setup.') },
    onSuccess: () => { toast.success('Refund updated.'); void qc.invalidateQueries({ queryKey: ['a-refunds'] }); void qc.invalidateQueries({ queryKey: ['a-payments'] }) }, onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <div className="space-y-6">
      <RazorpaySetup />
      <section><h3 className="mb-2 font-display text-lg font-semibold">Refund requests</h3>
        {ref.isLoading ? <Skeleton className="h-16" /> : !ref.data?.length ? <p className="text-sm text-muted">No refunds yet.</p> : <ul className="space-y-2">{ref.data.map((r) => (
          <li key={r.id} className="card flex flex-wrap items-center gap-3 p-3 text-sm"><div className="flex-1"><p className="font-medium">#{r.bookings?.reference} · {inr(r.amount_inr)}</p><p className="text-xs text-muted">{r.reason} · {fmtDateTime(r.created_at)}</p></div><span className="chip capitalize">{r.status}</span>
            {r.status === 'requested' && <><button className="btn btn-primary btn-sm" disabled={process.isPending} onClick={() => process.mutate({ id: r.id, action: 'approve' })}>Approve &amp; refund</button><button className="btn btn-ghost btn-sm" disabled={process.isPending} onClick={() => process.mutate({ id: r.id, action: 'reject' })}>Reject</button></>}</li>))}</ul>}</section>
      <section><h3 className="mb-2 font-display text-lg font-semibold">Payments</h3>
        {pay.isLoading ? <Skeleton className="h-16" /> : pay.isError ? <ErrorState onRetry={() => pay.refetch()} /> : <div className="card overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-blush-50 text-xs text-muted"><tr>{['Booking', 'Method', 'Amount', 'Status', 'Gateway ID', 'Date'].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">{pay.data?.map((p) => <tr key={p.id}><td className="px-3 py-2 font-mono text-xs">{p.bookings?.reference}</td><td className="px-3 py-2">{p.method}</td><td className="px-3 py-2">{inr(p.amount_inr)}</td><td className="px-3 py-2">{p.status}</td><td className="px-3 py-2 font-mono text-xs">{p.razorpay_payment_id ?? '—'}</td><td className="px-3 py-2">{fmtDateTime(p.created_at)}</td></tr>)}</tbody></table></div>}</section>
    </div>
  )
}

type RzpStatus = { configured: boolean; key_id: string; mode: 'test' | 'live' | null; has_webhook_secret: boolean }
const WEBHOOK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/razorpay-webhook`

function RazorpaySetup() {
  const qc = useQueryClient()
  const toast = useToast()
  const [keyId, setKeyId] = useState('')
  const [secret, setSecret] = useState('')
  const [wh, setWh] = useState('')
  const [show, setShow] = useState(false)
  const st = useQuery({
    queryKey: ['a-rzp'],
    queryFn: async () => {
      const r = await supabase.functions.invoke('admin-save-razorpay', { body: { action: 'status' } })
      if (r.error || r.data?.error) throw new Error(r.data?.error || 'Could not load Razorpay status.')
      return r.data as RzpStatus
    },
  })
  const call = useMutation({
    mutationFn: async (body: Record<string, string>) => {
      const r = await supabase.functions.invoke('admin-save-razorpay', { body })
      let msg = r.data?.error as string | undefined
      if (r.error && !msg) { try { msg = (await (r.error as { context?: Response }).context?.json())?.error } catch { /* ignore */ } }
      if (r.error || msg) throw new Error(msg || 'Request failed.')
      return r.data as RzpStatus
    },
    onSuccess: (d, v) => {
      qc.setQueryData(['a-rzp'], d)
      void qc.invalidateQueries({ queryKey: ['settings'] })
      setSecret(''); setWh(''); if (v.action === 'clear') setKeyId('')
      toast.success(v.action === 'clear' ? 'Razorpay disconnected.' : 'Razorpay connected. Online payments are now active.')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : friendlyError(e)),
  })
  const d = st.data
  return (
    <section className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-lg font-semibold">Razorpay online payments</h3>
        {d && <span className={`chip ${d.configured ? 'bg-green-100 text-green-800' : ''}`}>{d.configured ? `Active · ${d.mode === 'live' ? 'Live' : 'Test'} mode` : 'Not connected'}</span>}
      </div>
      {st.isError && <p className="text-sm text-red-600">{(st.error as Error).message}</p>}
      {d?.configured && <p className="text-sm text-muted">Connected key: <span className="font-mono">{d.key_id}</span> · Webhook secret: {d.has_webhook_secret ? 'saved' : 'not saved yet'}</p>}
      <p className="text-sm text-muted">Razorpay Dashboard → Account &amp; Settings → API Keys se Key ID aur Key Secret copy karke yahan dalein. Save karte hi keys verify hoti hain aur checkout par online payment active ho jata hai. Secret kabhi wapas dikhaya nahi jata.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">Key ID<input className="input mt-1 font-mono" placeholder="rzp_test_xxxxxxxx" value={keyId} onChange={(e) => setKeyId(e.target.value)} autoComplete="off" /></label>
        <label className="block text-sm">Key Secret
          <div className="relative mt-1"><input className="input pr-10 font-mono" type={show ? 'text' : 'password'} placeholder={d?.configured ? '•••••••• (enter to replace)' : 'Key Secret'} value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="new-password" />
            <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted" aria-label={show ? 'Hide' : 'Show'} onClick={() => setShow(!show)}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
        <label className="block text-sm sm:col-span-2">Webhook Secret (optional, recommended)<input className="input mt-1 font-mono" type={show ? 'text' : 'password'} placeholder="Secret you set while creating the webhook" value={wh} onChange={(e) => setWh(e.target.value)} autoComplete="new-password" /></label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={call.isPending || !keyId.trim() || !secret.trim()} onClick={() => call.mutate({ action: 'save', key_id: keyId, key_secret: secret, webhook_secret: wh })}>{call.isPending ? 'Verifying…' : d?.configured ? 'Update keys' : 'Save & activate'}</button>
        {d?.configured && <button className="btn btn-ghost" disabled={call.isPending} onClick={() => { if (confirm('Disconnect Razorpay? Customers will only see cash payment.')) call.mutate({ action: 'clear' }) }}>Disconnect</button>}
      </div>
      <div className="rounded-xl bg-blush-50 p-3 text-xs">
        <p className="font-medium">Webhook setup (Razorpay → Settings → Webhooks → Add)</p>
        <p className="mt-1 break-all">URL: <span className="font-mono">{WEBHOOK_URL}</span> <button className="ml-1 underline" onClick={() => { void navigator.clipboard?.writeText(WEBHOOK_URL); toast.success('Webhook URL copied.') }}>Copy</button></p>
        <p className="mt-1">Events: payment.captured, order.paid, payment.failed, refund.processed, refund.failed. Wahi secret yahan &ldquo;Webhook Secret&rdquo; me dalein.</p>
      </div>
    </section>
  )
}

function Brands() {
  const qc = useQueryClient()
  const toast = useToast()
  const brands = useQuery({ queryKey: ['a-brand-opts'], queryFn: async () => (await supabase.from('brands').select('id,name')).data ?? [] })
  const claims = useQuery({ queryKey: ['a-claims'], queryFn: async () => { const r = await supabase.from('salon_brand_services').select('id,verified,salons(name),brand_services(name,brands(name))').order('created_at', { ascending: false }).limit(100); if (r.error) throw r.error; return r.data as unknown as { id: string; verified: boolean; salons: { name: string }; brand_services: { name: string; brands: { name: string } } }[] } })
  const verify = useMutation({
    mutationFn: async (p: { id: string; v: boolean }) => { const { data: u } = await supabase.auth.getUser(); const r = await supabase.from('salon_brand_services').update({ verified: p.v, verified_by: p.v ? u.user?.id : null }).eq('id', p.id); if (r.error) throw r.error },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['a-claims'] }), onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <div className="space-y-8">
      <section><h3 className="mb-2 font-display text-lg font-semibold">Salon brand claims</h3>
        {!claims.data?.length ? <p className="text-sm text-muted">No claims yet. Salons can claim brand services from their dashboard; only verified claims are shown publicly.</p> : <ul className="space-y-2">{claims.data.map((c) => (
          <li key={c.id} className="card flex flex-wrap items-center gap-3 p-3 text-sm"><span className="flex-1"><strong>{c.salons?.name}</strong> — {c.brand_services?.brands?.name} · {c.brand_services?.name}</span>
            {c.verified ? <span className="chip bg-green-100 text-green-800"><BadgeCheck className="h-3.5 w-3.5" />Verified</span> : null}
            <button className="btn btn-outline btn-sm" onClick={() => verify.mutate({ id: c.id, v: !c.verified })}>{c.verified ? 'Revoke' : 'Verify'}</button></li>))}</ul>}</section>
      <Crud table="brands" title="Brands" defaults={{ is_active: true }} fields={[{ key: 'name', label: 'Brand name', required: true }, { key: 'slug', label: 'Slug', required: true }, { key: 'logo_url', label: 'Logo URL' }, { key: 'description', label: 'Description', type: 'textarea' }, { key: 'is_active', label: 'Active', type: 'bool' }]} columns={(r) => <p className="font-medium">{String(r.name)}</p>} />
      <Crud table="brand_services" title="Brand services" order="name" defaults={{ is_active: true }} fields={[{ key: 'brand_id', label: 'Brand', type: 'select', required: true, options: (brands.data ?? []).map((b) => ({ value: b.id, label: b.name })) }, { key: 'name', label: 'Service name', required: true }, { key: 'price_inr', label: 'Indicative price (₹)', type: 'number' }, { key: 'description', label: 'Description', type: 'textarea' }, { key: 'is_active', label: 'Active', type: 'bool' }]} columns={(r) => <p className="font-medium">{String(r.name)}</p>} />
    </div>
  )
}

function Marketing() {
  return (
    <div className="space-y-8">
      <Crud table="coupons" title="Coupons" defaults={{ discount_type: 'percent', is_active: true, per_user_limit: 1, min_order_inr: 0 }}
        fields={[{ key: 'code', label: 'Code', required: true, hint: '3–30 letters, numbers, - or _' }, { key: 'description', label: 'Description' }, { key: 'discount_type', label: 'Type', type: 'select', required: true, options: [{ value: 'percent', label: 'Percent' }, { value: 'flat', label: 'Flat ₹' }] }, { key: 'value', label: 'Value', type: 'number', required: true }, { key: 'max_discount_inr', label: 'Max discount (₹)', type: 'number' }, { key: 'min_order_inr', label: 'Minimum order (₹)', type: 'number' }, { key: 'usage_limit', label: 'Total usage limit', type: 'number' }, { key: 'per_user_limit', label: 'Per user limit', type: 'number' }, { key: 'starts_at', label: 'Starts', type: 'datetime' }, { key: 'expires_at', label: 'Expires', type: 'datetime' }, { key: 'is_active', label: 'Active', type: 'bool' }]}
        columns={(r) => <><p className="font-mono font-semibold uppercase">{String(r.code)} {!r.is_active && <span className="chip">Off</span>}</p><p className="text-xs text-muted">{r.discount_type === 'percent' ? `${r.value}%` : `₹${r.value}`} · used {String(r.used_count)}{r.usage_limit ? `/${r.usage_limit}` : ''}</p></>} />
      <Crud table="banners" title="Banners" order="sort_order" defaults={{ is_active: true, sort_order: 0 }}
        fields={[{ key: 'title', label: 'Title', required: true }, { key: 'subtitle', label: 'Subtitle' }, { key: 'image_url', label: 'Image URL' }, { key: 'link_url', label: 'Link (e.g. /wedding)' }, { key: 'sort_order', label: 'Order', type: 'number' }, { key: 'starts_at', label: 'Starts', type: 'datetime' }, { key: 'ends_at', label: 'Ends', type: 'datetime' }, { key: 'is_active', label: 'Active', type: 'bool' }]}
        columns={(r) => <p className="font-medium">{String(r.title)}{!r.is_active && <span className="chip ml-2">Off</span>}</p>} />
    </div>
  )
}

function Reviews() {
  const qc = useQueryClient()
  const toast = useToast()
  const q = useQuery({ queryKey: ['a-reviews'], queryFn: async () => { const r = await supabase.from('reviews').select('id,rating,comment,is_visible,reported,report_reason,created_at,salons(name)').order('reported', { ascending: false }).order('created_at', { ascending: false }).limit(100); if (r.error) throw r.error; return r.data as unknown as { id: string; rating: number; comment: string | null; is_visible: boolean; reported: boolean; report_reason: string | null; created_at: string; salons: { name: string } }[] } })
  const mod = useMutation({ mutationFn: async (p: { id: string; v: boolean }) => { const r = await supabase.rpc('admin_moderate_review', { p_review_id: p.id, p_visible: p.v }); if (r.error) throw r.error }, onSuccess: () => void qc.invalidateQueries({ queryKey: ['a-reviews'] }), onError: (e) => toast.error(friendlyError(e)) })
  if (q.isLoading) return <Skeleton className="h-24" />
  if (!q.data?.length) return <EmptyState title="No reviews yet" />
  return <ul className="space-y-2">{q.data.map((r) => (
    <li key={r.id} className={`card p-3 text-sm ${r.reported ? 'border-amber-300' : ''}`}><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{r.salons?.name} · {r.rating}★ {r.reported && <span className="chip ml-1 bg-amber-100 text-amber-800"><Flag className="h-3 w-3" />Reported</span>}</p>
      <button className="btn btn-outline btn-sm" onClick={() => mod.mutate({ id: r.id, v: !r.is_visible })}>{r.is_visible ? <><EyeOff className="h-4 w-4" />Hide</> : <><Eye className="h-4 w-4" />Show</>}</button></div>
      <p className="mt-1 text-muted">{r.comment || '(no comment)'}</p>{r.report_reason && <p className="text-xs text-amber-800">Report: {r.report_reason}</p>}</li>))}</ul>
}

function Support() {
  const qc = useQueryClient()
  const toast = useToast()
  const [open, setOpen] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const q = useQuery({ queryKey: ['a-tickets'], queryFn: async () => { const r = await supabase.from('support_tickets').select('*').order('created_at', { ascending: false }).limit(100); if (r.error) throw r.error; return r.data as { id: string; name: string; email: string | null; phone: string | null; subject: string; message: string; status: string; admin_notes: string | null; created_at: string }[] } })
  const upd = useMutation({ mutationFn: async (p: { id: string; status: string }) => { const r = await supabase.from('support_tickets').update({ status: p.status, admin_notes: notes.trim() || null, updated_at: new Date().toISOString() }).eq('id', p.id); if (r.error) throw r.error }, onSuccess: () => { toast.success('Ticket updated.'); void qc.invalidateQueries({ queryKey: ['a-tickets'] }) }, onError: (e) => toast.error(friendlyError(e)) })
  if (q.isLoading) return <Skeleton className="h-24" />
  if (!q.data?.length) return <EmptyState title="No tickets" text="Contact-form messages and wedding quote requests appear here." />
  return <ul className="space-y-2">{q.data.map((t) => (
    <li key={t.id} className="card p-3 text-sm"><button className="flex w-full items-start justify-between gap-2 text-left" onClick={() => { setOpen(open === t.id ? null : t.id); setNotes(t.admin_notes ?? '') }}><span><strong>{t.subject}</strong><br /><span className="text-xs text-muted">{t.name} · {t.email ?? t.phone} · {fmtDateTime(t.created_at)}</span></span><span className="chip capitalize">{t.status}</span></button>
      {open === t.id && <div className="mt-3 space-y-2 border-t border-line pt-3"><p className="whitespace-pre-wrap">{t.message}</p>{t.phone && <a className="text-lush-600" href={`tel:${t.phone}`}>{t.phone}</a>}
        <textarea className="input min-h-16" placeholder="Internal notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="flex gap-2">{['open', 'in_progress', 'resolved'].map((s) => <button key={s} className={`btn btn-sm ${t.status === s ? 'btn-primary' : 'btn-outline'}`} onClick={() => upd.mutate({ id: t.id, status: s })}>{s.replace('_', ' ')}</button>)}</div></div>}</li>))}</ul>
}

const SETTINGS: { key: string; label: string; type: 'number' | 'bool' | 'text'; hint?: string }[] = [
  { key: 'search_radius_km', label: 'Nearby search radius (km)', type: 'number', hint: 'Default 5 km' },
  { key: 'service_area_label', label: 'Launch area label', type: 'text', hint: 'Confirm the exact locality before launch' },
  { key: 'tax_percent', label: 'GST / tax (%)', type: 'number' },
  { key: 'platform_fee_inr', label: 'Platform fee per booking (₹)', type: 'number' },
  { key: 'cancellation_window_hours', label: 'Free cancellation window (hours)', type: 'number' },
  { key: 'cash_payments_enabled', label: 'Allow cash on service', type: 'bool' },
  { key: 'online_payments_enabled', label: 'Allow online payments', type: 'bool' },
  { key: 'business_email', label: 'Support email', type: 'text' },
  { key: 'business_phone', label: 'Support phone', type: 'text' },
]
function Settings() {
  const qc = useQueryClient()
  const toast = useToast()
  const q = useQuery({ queryKey: ['a-settings'], queryFn: async () => Object.fromEntries(((await supabase.from('app_settings').select('key,value')).data ?? []).map((x) => [x.key, x.value])) as Record<string, unknown> })
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const save = useMutation({
    mutationFn: async () => {
      for (const [key, value] of Object.entries(draft)) {
        const def = SETTINGS.find((s) => s.key === key)!
        if (def.type === 'number' && (Number.isNaN(Number(value)) || Number(value) < 0)) throw new Error(`${def.label}: enter a valid number.`)
        const r = await supabase.from('app_settings').update({ value: def.type === 'number' ? Number(value) : value, updated_at: new Date().toISOString() }).eq('key', key)
        if (r.error) throw r.error
      }
    },
    onSuccess: () => { setDraft({}); toast.success('Settings saved.'); void qc.invalidateQueries({ queryKey: ['a-settings'] }); void qc.invalidateQueries({ queryKey: ['settings'] }) }, onError: (e) => toast.error(friendlyError(e)),
  })
  if (!q.data) return <Skeleton className="h-40" />
  const val = (k: string) => (k in draft ? draft[k] : q.data![k])
  return (
    <div className="card max-w-xl space-y-4 p-5">
      {SETTINGS.map((s) => s.type === 'bool'
        ? <label key={s.key} className="flex items-center justify-between text-sm"><span>{s.label}</span><input type="checkbox" className="h-5 w-5 accent-lush-600" checked={!!val(s.key)} onChange={(e) => setDraft({ ...draft, [s.key]: e.target.checked })} /></label>
        : <label key={s.key} className="block"><span className="label">{s.label}</span><input className="input" type={s.type === 'number' ? 'number' : 'text'} step="any" value={String(val(s.key) ?? '')} onChange={(e) => setDraft({ ...draft, [s.key]: e.target.value })} />{s.hint && <span className="text-xs text-muted">{s.hint}</span>}</label>)}
      <button className="btn btn-primary" disabled={!Object.keys(draft).length || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save settings'}</button>
    </div>
  )
}
