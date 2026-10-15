import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, ImagePlus, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { supabase, publicUrl } from '../../lib/supabase'
import { getCategories } from '../../lib/api'
import { friendlyError } from '../../lib/errors'
import { duration, inr } from '../../lib/format'
import { useToast } from '../../context/ToastContext'
import { EmptyState, ErrorState, Field, Modal, Skeleton, Spinner } from '../../components/ui'
import type { SalonService } from '../../lib/types'

/* ---------------------------------------------------------------- services */
type SvcForm = { id?: string; name: string; category_id: string; description: string; price_inr: string; duration_min: string; buffer_min: string; at_salon: boolean; at_home: boolean; is_wedding: boolean; is_active: boolean }
const blank: SvcForm = { name: '', category_id: '', description: '', price_inr: '', duration_min: '60', buffer_min: '0', at_salon: true, at_home: false, is_wedding: false, is_active: true }

export function ServicesEditor({ salonId, homeService }: { salonId: string; homeService: boolean }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState<SvcForm | null>(null)
  const cats = useQuery({ queryKey: ['categories'], queryFn: getCategories, staleTime: 600000 })
  const list = useQuery({
    queryKey: ['p-services', salonId],
    queryFn: async () => { const r = await supabase.from('salon_services').select('*,service_categories(name,slug)').eq('salon_id', salonId).order('created_at', { ascending: false }); if (r.error) throw r.error; return r.data as unknown as SalonService[] },
  })
  const save = useMutation({
    mutationFn: async (f: SvcForm) => {
      const price = Number(f.price_inr), dur = Number(f.duration_min), buf = Number(f.buffer_min)
      if (f.name.trim().length < 2) throw new Error('Enter a service name.')
      if (!(price >= 0) || f.price_inr === '') throw new Error('Enter a valid price.')
      if (!(dur >= 5 && dur <= 720)) throw new Error('Duration must be 5–720 minutes.')
      if (!(buf >= 0 && buf <= 120)) throw new Error('Buffer must be 0–120 minutes.')
      if (!f.at_salon && !f.at_home) throw new Error('Choose at least one place of service.')
      const row = { salon_id: salonId, name: f.name.trim(), category_id: f.category_id || null, description: f.description.trim() || null, price_inr: price, duration_min: dur, buffer_min: buf, at_salon: f.at_salon, at_home: f.at_home && homeService, is_wedding: f.is_wedding, is_active: f.is_active }
      const r = f.id ? await supabase.from('salon_services').update(row).eq('id', f.id) : await supabase.from('salon_services').insert(row)
      if (r.error) throw r.error
    },
    onSuccess: () => { setForm(null); void qc.invalidateQueries({ queryKey: ['p-services', salonId] }); toast.success('Service saved.') },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const del = useMutation({
    mutationFn: async (id: string) => { const r = await supabase.from('salon_services').delete().eq('id', id); if (r.error) throw r.error },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['p-services', salonId] }), onError: (e) => toast.error(friendlyError(e)),
  })
  const toggle = useMutation({
    mutationFn: async (s: SalonService) => { const r = await supabase.from('salon_services').update({ is_active: !s.is_active }).eq('id', s.id); if (r.error) throw r.error },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['p-services', salonId] }),
  })
  return (
    <div>
      <div className="mb-3 flex items-center justify-between"><h3 className="font-display text-lg font-semibold">Services &amp; prices</h3><button type="button" className="btn btn-primary btn-sm" onClick={() => setForm(blank)}><Plus className="h-4 w-4" />Add service</button></div>
      {list.isLoading ? <Skeleton className="h-20" /> : list.isError ? <ErrorState onRetry={() => list.refetch()} /> : !list.data?.length ? <EmptyState title="No services yet" text="Add the services you offer with price and duration." /> : (
        <ul className="space-y-2">{list.data.map((s) => (
          <li key={s.id} className={`card flex flex-wrap items-center gap-3 p-3 ${s.is_active ? '' : 'opacity-60'}`}>
            <div className="min-w-0 flex-1"><p className="font-medium">{s.name}</p><p className="text-xs text-muted">{s.service_categories?.name ?? 'Uncategorised'} · {duration(s.duration_min)} · {inr(s.price_inr)} · {[s.at_salon && 'Salon', s.at_home && 'Home', s.is_wedding && 'Wedding'].filter(Boolean).join(' / ')}</p></div>
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" className="accent-lush-600" checked={s.is_active} onChange={() => toggle.mutate(s)} />Active</label>
            <button type="button" aria-label="Edit" className="p-1.5 text-muted hover:text-lush-600" onClick={() => setForm({ id: s.id, name: s.name, category_id: s.category_id ?? '', description: s.description ?? '', price_inr: String(s.price_inr), duration_min: String(s.duration_min), buffer_min: String(s.buffer_min), at_salon: s.at_salon, at_home: s.at_home, is_wedding: s.is_wedding, is_active: s.is_active })}><Pencil className="h-4 w-4" /></button>
            <button type="button" aria-label="Delete" className="p-1.5 text-muted hover:text-red-600" onClick={() => { if (window.confirm(`Delete “${s.name}”?`)) del.mutate(s.id) }}><Trash2 className="h-4 w-4" /></button>
          </li>))}</ul>)}
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit service' : 'Add service'}>
        {form && <div className="space-y-3">
          <Field label="Service name" required><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Category"><select className="input" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}><option value="">Select…</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Description"><textarea className="input min-h-20" maxLength={500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Price (₹)" required><input className="input" inputMode="decimal" value={form.price_inr} onChange={(e) => setForm({ ...form, price_inr: e.target.value.replace(/[^\d.]/g, '') })} /></Field>
            <Field label="Minutes" required><input className="input" inputMode="numeric" value={form.duration_min} onChange={(e) => setForm({ ...form, duration_min: e.target.value.replace(/\D/g, '') })} /></Field>
            <Field label="Buffer min"><input className="input" inputMode="numeric" value={form.buffer_min} onChange={(e) => setForm({ ...form, buffer_min: e.target.value.replace(/\D/g, '') })} /></Field>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" className="accent-lush-600" checked={form.at_salon} onChange={(e) => setForm({ ...form, at_salon: e.target.checked })} />At salon</label>
            <label className={`flex items-center gap-2 ${homeService ? '' : 'opacity-50'}`}><input type="checkbox" className="accent-lush-600" disabled={!homeService} checked={form.at_home && homeService} onChange={(e) => setForm({ ...form, at_home: e.target.checked })} />At home{!homeService && ' (enable home service first)'}</label>
            <label className="flex items-center gap-2"><input type="checkbox" className="accent-lush-600" checked={form.is_wedding} onChange={(e) => setForm({ ...form, is_wedding: e.target.checked })} />Wedding package</label>
          </div>
          <div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Cancel</button><button type="button" className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate(form)}>{save.isPending ? 'Saving…' : 'Save'}</button></div>
        </div>}
      </Modal>
    </div>
  )
}

/* ------------------------------------------------------------------- hours */
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
type Hr = { opens: string; closes: string; closed: boolean }
export function HoursEditor({ salonId, onSaved }: { salonId: string; onSaved?: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [rows, setRows] = useState<Hr[] | null>(null)
  const q = useQuery({ queryKey: ['p-hours', salonId], queryFn: async () => { const r = await supabase.from('salon_business_hours').select('weekday,opens,closes,is_closed').eq('salon_id', salonId); if (r.error) throw r.error; return r.data } })
  useEffect(() => {
    if (!q.data) return
    setRows(DAYS.map((_, d) => { const x = q.data.find((h) => h.weekday === d); return x ? { opens: x.opens?.slice(0, 5) ?? '10:00', closes: x.closes?.slice(0, 5) ?? '19:00', closed: x.is_closed } : { opens: '10:00', closes: '19:00', closed: d === 0 } }))
  }, [q.data])
  const save = useMutation({
    mutationFn: async () => {
      for (const [d, r] of rows!.entries()) if (!r.closed && r.closes <= r.opens) throw new Error(`${DAYS[d]}: closing time must be after opening time.`)
      const r = await supabase.from('salon_business_hours').upsert(rows!.map((h, d) => ({ salon_id: salonId, weekday: d, opens: h.closed ? null : h.opens, closes: h.closed ? null : h.closes, is_closed: h.closed })), { onConflict: 'salon_id,weekday' })
      if (r.error) throw r.error
    },
    onSuccess: () => { toast.success('Business hours saved.'); void qc.invalidateQueries({ queryKey: ['p-hours', salonId] }); onSaved?.() }, onError: (e) => toast.error(friendlyError(e)),
  })
  if (!rows) return q.isError ? <ErrorState onRetry={() => q.refetch()} /> : <Skeleton className="h-40" />
  const set = (d: number, p: Partial<Hr>) => setRows(rows.map((r, i) => (i === d ? { ...r, ...p } : r)))
  return (
    <div>
      <h3 className="mb-3 font-display text-lg font-semibold">Business hours</h3>
      <div className="space-y-2">{rows.map((r, d) => (
        <div key={d} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white p-2.5 text-sm">
          <span className="w-24 font-medium">{DAYS[d]}</span>
          <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-lush-600" checked={r.closed} onChange={(e) => set(d, { closed: e.target.checked })} />Closed</label>
          {!r.closed && <><input aria-label={`${DAYS[d]} opens`} type="time" className="input !w-auto !py-1.5" value={r.opens} onChange={(e) => set(d, { opens: e.target.value })} /><span>to</span><input aria-label={`${DAYS[d]} closes`} type="time" className="input !w-auto !py-1.5" value={r.closes} onChange={(e) => set(d, { closes: e.target.value })} /></>}
        </div>))}</div>
      <button type="button" className="btn btn-primary btn-sm mt-3" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save hours'}</button>
    </div>
  )
}

/* ------------------------------------------------------------------ photos */
const MAX = 5 * 1024 * 1024
export async function uploadSalonImage(salonId: string, file: File, tag: string): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Use a JPG, PNG or WebP image.')
  if (file.size > MAX) throw new Error('Image must be under 5 MB.')
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${salonId}/${tag}-${Date.now()}.${ext}`
  const r = await supabase.storage.from('salon-media').upload(path, file, { contentType: file.type, cacheControl: '31536000' })
  if (r.error) throw r.error
  return path
}

export function PhotosEditor({ salonId, logo, cover, onChanged }: { salonId: string; logo: string | null; cover: string | null; onChanged: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const gal = useQuery({ queryKey: ['p-gallery', salonId], queryFn: async () => { const r = await supabase.from('salon_images').select('id,url,kind').eq('salon_id', salonId).order('created_at'); if (r.error) throw r.error; return r.data as { id: string; url: string; kind: string }[] } })
  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); try { await fn(); onChanged() } catch (e) { toast.error(friendlyError(e)) } setBusy(null) }
  const setSingle = (col: 'logo_url' | 'cover_url', f: File) => run(col, async () => { const p = await uploadSalonImage(salonId, f, col === 'logo_url' ? 'logo' : 'cover'); const r = await supabase.from('salons').update({ [col]: p }).eq('id', salonId); if (r.error) throw r.error })
  const addGallery = (files: FileList) => run('gal', async () => { for (const f of Array.from(files).slice(0, 8)) { const p = await uploadSalonImage(salonId, f, 'gallery'); const r = await supabase.from('salon_images').insert({ salon_id: salonId, url: p, kind: 'gallery' }); if (r.error) throw r.error } await qc.invalidateQueries({ queryKey: ['p-gallery', salonId] }) })
  const rm = (id: string) => run(id, async () => { const r = await supabase.from('salon_images').delete().eq('id', id); if (r.error) throw r.error; await qc.invalidateQueries({ queryKey: ['p-gallery', salonId] }) })
  const Pick = ({ label, col, cur }: { label: string; col: 'logo_url' | 'cover_url'; cur: string | null }) => {
    const ref = useRef<HTMLInputElement>(null)
    return (
      <div><p className="label">{label}</p>
        <button type="button" onClick={() => ref.current?.click()} className="flex h-28 w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-blush-300 bg-blush-50 text-muted hover:border-lush-400">
          {busy === col ? <Spinner /> : cur ? <img src={publicUrl(cur)!} alt="" className="h-full w-full object-cover" /> : <span className="flex flex-col items-center text-xs"><Upload className="h-5 w-5" />Upload</span>}
        </button>
        <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void setSingle(col, f); e.target.value = '' }} />
      </div>)
  }
  const gref = useRef<HTMLInputElement>(null)
  return (
    <div className="space-y-4">
      <h3 className="font-display text-lg font-semibold">Photos</h3>
      <div className="grid gap-4 sm:grid-cols-2"><Pick label="Logo" col="logo_url" cur={logo} /><Pick label="Cover photo" col="cover_url" cur={cover} /></div>
      <div>
        <div className="mb-2 flex items-center justify-between"><p className="label !mb-0">Gallery</p><button type="button" className="btn btn-outline btn-sm" disabled={busy === 'gal'} onClick={() => gref.current?.click()}><ImagePlus className="h-4 w-4" />{busy === 'gal' ? 'Uploading…' : 'Add photos'}</button></div>
        <input ref={gref} type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { if (e.target.files?.length) void addGallery(e.target.files); e.target.value = '' }} />
        {gal.data?.length ? <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{gal.data.map((g) => (
          <div key={g.id} className="group relative aspect-square overflow-hidden rounded-xl"><img src={publicUrl(g.url)!} alt="" className="h-full w-full object-cover" />
            <button type="button" aria-label="Remove photo" className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-red-600" onClick={() => rm(g.id)}><Trash2 className="h-3.5 w-3.5" /></button></div>))}</div> : <p className="text-sm text-muted">No gallery photos yet. JPG/PNG/WebP, up to 5 MB each.</p>}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------- staff */
export function StaffEditor({ salonId }: { salonId: string }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState(''); const [role, setRole] = useState('')
  const q = useQuery({ queryKey: ['p-staff', salonId], queryFn: async () => { const r = await supabase.from('salon_staff').select('id,name,role_title,is_active').eq('salon_id', salonId).order('created_at'); if (r.error) throw r.error; return r.data as { id: string; name: string; role_title: string | null; is_active: boolean }[] } })
  const add = useMutation({
    mutationFn: async () => { if (name.trim().length < 2) throw new Error('Enter the staff name.'); const r = await supabase.from('salon_staff').insert({ salon_id: salonId, name: name.trim(), role_title: role.trim() || null }); if (r.error) throw r.error },
    onSuccess: () => { setName(''); setRole(''); void qc.invalidateQueries({ queryKey: ['p-staff', salonId] }) }, onError: (e) => toast.error(friendlyError(e)),
  })
  const upd = useMutation({
    mutationFn: async (p: { id: string; del?: boolean; active?: boolean }) => { const r = p.del ? await supabase.from('salon_staff').delete().eq('id', p.id) : await supabase.from('salon_staff').update({ is_active: p.active }).eq('id', p.id); if (r.error) throw r.error },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['p-staff', salonId] }), onError: (e) => toast.error(friendlyError(e)),
  })
  return (
    <div>
      <h3 className="mb-1 font-display text-lg font-semibold">Beauticians / staff</h3>
      <p className="mb-3 text-xs text-muted">Customers can choose a specific beautician; each one has their own calendar. Leave empty to use salon capacity.</p>
      <div className="flex flex-wrap gap-2"><input className="input !w-auto flex-1" placeholder="Name" aria-label="Staff name" value={name} onChange={(e) => setName(e.target.value)} /><input className="input !w-auto flex-1" placeholder="Role (e.g. Senior stylist)" aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)} /><button type="button" className="btn btn-primary btn-sm" onClick={() => add.mutate()} disabled={add.isPending}><Plus className="h-4 w-4" />Add</button></div>
      <ul className="mt-3 space-y-2">{q.data?.map((s) => (
        <li key={s.id} className="card flex items-center gap-3 p-3 text-sm"><span className="flex-1"><strong>{s.name}</strong>{s.role_title && <span className="text-muted"> — {s.role_title}</span>}</span>
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" className="accent-lush-600" checked={s.is_active} onChange={(e) => upd.mutate({ id: s.id, active: e.target.checked })} />Active</label>
          <button type="button" aria-label="Remove" className="text-muted hover:text-red-600" onClick={() => { if (window.confirm(`Remove ${s.name}?`)) upd.mutate({ id: s.id, del: true }) }}><Trash2 className="h-4 w-4" /></button></li>))}</ul>
    </div>
  )
}

/* ------------------------------------------------------------------ brands */
export function BrandsEditor({ salonId }: { salonId: string }) {
  const qc = useQueryClient()
  const toast = useToast()
  const bs = useQuery({ queryKey: ['p-brand-services'], queryFn: async () => { const r = await supabase.from('brand_services').select('id,name,brands!inner(name,is_active)').eq('is_active', true).eq('brands.is_active', true); if (r.error) throw r.error; return r.data as unknown as { id: string; name: string; brands: { name: string } }[] } })
  const mine = useQuery({ queryKey: ['p-brand-mine', salonId], queryFn: async () => { const r = await supabase.from('salon_brand_services').select('id,brand_service_id,verified').eq('salon_id', salonId); if (r.error) throw r.error; return r.data as { id: string; brand_service_id: string; verified: boolean }[] } })
  const [pick, setPick] = useState('')
  const add = useMutation({
    mutationFn: async () => { const r = await supabase.from('salon_brand_services').insert({ salon_id: salonId, brand_service_id: pick, verified: false }); if (r.error) throw r.error },
    onSuccess: () => { setPick(''); toast.success('Submitted. It appears publicly only after Lushira verifies it.'); void qc.invalidateQueries({ queryKey: ['p-brand-mine', salonId] }) }, onError: (e) => toast.error(friendlyError(e)),
  })
  const rm = useMutation({ mutationFn: async (id: string) => { const r = await supabase.from('salon_brand_services').delete().eq('id', id); if (r.error) throw r.error }, onSuccess: () => void qc.invalidateQueries({ queryKey: ['p-brand-mine', salonId] }) })
  const mineIds = new Set(mine.data?.map((m) => m.brand_service_id))
  return (
    <div>
      <h3 className="mb-1 font-display text-lg font-semibold">Brand services</h3>
      <p className="mb-3 text-xs text-muted">Claim a brand service you genuinely offer. It is shown to customers only after our team verifies it.</p>
      {!bs.data?.length ? <p className="text-sm text-muted">No brands are available to claim yet.</p> : (
        <div className="flex gap-2"><select className="input" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Brand service"><option value="">Select a brand service…</option>{bs.data.filter((b) => !mineIds.has(b.id)).map((b) => <option key={b.id} value={b.id}>{b.brands.name} — {b.name}</option>)}</select><button type="button" className="btn btn-primary btn-sm" disabled={!pick || add.isPending} onClick={() => add.mutate()}>Claim</button></div>)}
      <ul className="mt-3 space-y-2">{mine.data?.map((m) => { const b = bs.data?.find((x) => x.id === m.brand_service_id); return (
        <li key={m.id} className="card flex items-center gap-2 p-3 text-sm"><span className="flex-1">{b ? `${b.brands.name} — ${b.name}` : 'Brand service'}</span>
          {m.verified ? <span className="chip bg-green-100 text-green-800"><BadgeCheck className="h-3.5 w-3.5" />Verified</span> : <span className="chip bg-amber-100 text-amber-800">Pending verification</span>}
          <button type="button" aria-label="Remove" className="text-muted hover:text-red-600" onClick={() => rm.mutate(m.id)}><Trash2 className="h-4 w-4" /></button></li>) })}</ul>
    </div>
  )
}
