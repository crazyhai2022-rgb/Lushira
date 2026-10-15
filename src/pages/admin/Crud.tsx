import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { friendlyError } from '../../lib/errors'
import { useToast } from '../../context/ToastContext'
import { EmptyState, ErrorState, Field, Modal, Skeleton } from '../../components/ui'

export interface CrudField {
  key: string
  label: string
  type?: 'text' | 'number' | 'bool' | 'textarea' | 'select' | 'datetime'
  options?: { value: string; label: string }[]
  required?: boolean
  hint?: string
}
type Row = Record<string, unknown> & { id: string }

const toLocal = (iso: unknown) => (iso ? new Date(String(iso)).toISOString().slice(0, 16) : '')

export function Crud({ table, title, fields, columns, order = 'created_at', defaults = {}, canDelete = true, extra }: {
  table: string; title: string; fields: CrudField[]; columns: (r: Row) => ReactNode; order?: string; defaults?: Record<string, unknown>; canDelete?: boolean; extra?: ReactNode
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState<Record<string, unknown> | null>(null)
  const q = useQuery({ queryKey: ['a-' + table], queryFn: async () => { const r = await supabase.from(table).select('*').order(order, { ascending: false }).limit(300); if (r.error) throw r.error; return r.data as unknown as Row[] } })
  const save = useMutation({
    mutationFn: async () => {
      const f = form!
      const row: Record<string, unknown> = {}
      for (const fd of fields) {
        let v = f[fd.key]
        if (fd.required && (v === undefined || v === null || v === '')) throw new Error(`${fd.label} is required.`)
        if (fd.type === 'number') v = v === '' || v == null ? null : Number(v)
        else if (fd.type === 'datetime') v = v ? new Date(String(v)).toISOString() : null
        else if (fd.type === 'bool') v = !!v
        else if (typeof v === 'string') v = v.trim() === '' ? null : v.trim()
        row[fd.key] = v
      }
      const r = f.id ? await supabase.from(table).update(row).eq('id', f.id as string) : await supabase.from(table).insert(row)
      if (r.error) throw r.error
    },
    onSuccess: () => { setForm(null); void qc.invalidateQueries({ queryKey: ['a-' + table] }); toast.success('Saved.') },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const del = useMutation({
    mutationFn: async (id: string) => { const r = await supabase.from(table).delete().eq('id', id); if (r.error) throw r.error },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['a-' + table] }), onError: (e) => toast.error(friendlyError(e)),
  })
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f!, [k]: v }))
  return (
    <div>
      <div className="mb-3 flex items-center justify-between"><h3 className="font-display text-lg font-semibold">{title}</h3><button className="btn btn-primary btn-sm" onClick={() => setForm({ ...defaults })}><Plus className="h-4 w-4" />Add</button></div>
      {extra}
      {q.isLoading ? <Skeleton className="h-24" /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : !q.data?.length ? <EmptyState title={`No ${title.toLowerCase()} yet`} /> : (
        <ul className="space-y-2">{q.data.map((r) => (
          <li key={r.id} className="card flex items-center gap-3 p-3 text-sm"><div className="min-w-0 flex-1">{columns(r)}</div>
            <button aria-label="Edit" className="p-1.5 text-muted hover:text-lush-600" onClick={() => setForm(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, fields.find((x) => x.key === k)?.type === 'datetime' ? toLocal(v) : v ?? ''])))}><Pencil className="h-4 w-4" /></button>
            {canDelete && <button aria-label="Delete" className="p-1.5 text-muted hover:text-red-600" onClick={() => { if (window.confirm('Delete this item?')) del.mutate(r.id) }}><Trash2 className="h-4 w-4" /></button>}
          </li>))}</ul>)}
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? `Edit ${title}` : `Add ${title}`}>
        {form && <div className="space-y-3">
          {fields.map((fd) => fd.type === 'bool'
            ? <label key={fd.key} className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-lush-600" checked={!!form[fd.key]} onChange={(e) => set(fd.key, e.target.checked)} />{fd.label}</label>
            : <Field key={fd.key} label={fd.label} required={fd.required} hint={fd.hint}>
              {fd.type === 'textarea' ? <textarea className="input min-h-20" value={String(form[fd.key] ?? '')} onChange={(e) => set(fd.key, e.target.value)} /> :
                fd.type === 'select' ? <select className="input" value={String(form[fd.key] ?? '')} onChange={(e) => set(fd.key, e.target.value)}><option value="">—</option>{fd.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select> :
                  <input className="input" type={fd.type === 'number' ? 'number' : fd.type === 'datetime' ? 'datetime-local' : 'text'} step={fd.type === 'number' ? 'any' : undefined} value={String(form[fd.key] ?? '')} onChange={(e) => set(fd.key, e.target.value)} />}
            </Field>)}
          <div className="flex justify-end gap-2"><button className="btn btn-ghost" onClick={() => setForm(null)}>Cancel</button><button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save'}</button></div>
        </div>}
      </Modal>
    </div>
  )
}
