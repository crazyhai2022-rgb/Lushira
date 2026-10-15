import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, CheckCheck, ImagePlus, MessageCircle, Phone, Send, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { friendlyError } from '../lib/errors'
import { fmtTime } from '../lib/format'

export interface ChatMsg { id: string; booking_id: string; sender_id: string; body: string | null; image_path: string | null; created_at: string; delivered_at: string | null; read_at: string | null }

export const CHAT_STATUSES = ['confirmed', 'provider_assigned', 'on_the_way', 'in_progress', 'completed']

/** Marks incoming messages as delivered as soon as this device receives them (even if the chat is closed). */
export function useChatDelivery() {
  const { user } = useAuth()
  useEffect(() => {
    if (!user) return
    const ch = supabase.channel(`chat-delivery-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'booking_messages' }, (p) => {
        const m = p.new as ChatMsg
        if (m.sender_id !== user.id) void supabase.rpc('mark_messages_delivered', { p_booking_id: m.booking_id })
      }).subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [user])
}

/** Unread incoming message count for one booking (live). */
export function useUnread(bookingId: string, enabled = true) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['chat-unread', bookingId], enabled: enabled && !!user,
    queryFn: async () => {
      const r = await supabase.from('booking_messages').select('id', { count: 'exact', head: true }).eq('booking_id', bookingId).neq('sender_id', user!.id).is('read_at', null)
      return r.count ?? 0
    },
  })
  useEffect(() => {
    if (!enabled || !user) return
    const ch = supabase.channel(`chat-unread-${bookingId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_messages', filter: `booking_id=eq.${bookingId}` }, () => void qc.invalidateQueries({ queryKey: ['chat-unread', bookingId] }))
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [bookingId, enabled, user, qc])
  return q.data ?? 0
}

export function ChatButton({ bookingId, onOpen, className = 'btn btn-outline btn-sm' }: { bookingId: string; onOpen: () => void; className?: string }) {
  const n = useUnread(bookingId)
  return (
    <button type="button" className={`${className} relative`} onClick={onOpen}>
      <MessageCircle className="h-4 w-4" />Chat
      {n > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-lush-600 px-1 text-[11px] font-bold text-white">{n}</span>}
    </button>
  )
}

function Ticks({ m }: { m: ChatMsg }) {
  if (m.read_at) return <CheckCheck className="h-3.5 w-3.5 text-sky-400" aria-label="Seen" />
  if (m.delivered_at) return <CheckCheck className="h-3.5 w-3.5 opacity-70" aria-label="Delivered" />
  return <Check className="h-3.5 w-3.5 opacity-70" aria-label="Sent" />
}

function Photo({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [big, setBig] = useState(false)
  useEffect(() => { let on = true; void supabase.storage.from('chat-media').createSignedUrl(path, 3600).then((r) => { if (on) setUrl(r.data?.signedUrl ?? null) }); return () => { on = false } }, [path])
  if (!url) return <div className="h-40 w-48 animate-pulse rounded-xl bg-black/10" />
  return (<>
    <button type="button" onClick={() => setBig(true)}><img src={url} alt="Shared photo" className="max-h-60 w-52 rounded-xl object-cover" /></button>
    {big && createPortal(<div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-4" onClick={() => setBig(false)}><img src={url} alt="Shared photo" className="max-h-full max-w-full rounded-lg" /></div>, document.body)}
  </>)
}

async function shrink(file: File): Promise<Blob> {
  if (file.size < 600_000 && file.type !== 'image/heic') return file
  const bmp = await createImageBitmap(file)
  const s = Math.min(1, 1400 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('image'))), 'image/jpeg', 0.82))
}

export default function BookingChat({ bookingId, title, phone, onClose }: { bookingId: string; title: string; phone?: string | null; onClose: () => void }) {
  const { user } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const me = user?.id

  const q = useQuery({
    queryKey: ['chat', bookingId],
    queryFn: async () => { const r = await supabase.from('booking_messages').select('*').eq('booking_id', bookingId).order('created_at'); if (r.error) throw r.error; return (r.data ?? []) as ChatMsg[] },
  })
  const markRead = useCallback(() => { void supabase.rpc('mark_messages_read', { p_booking_id: bookingId }).then(() => qc.invalidateQueries({ queryKey: ['chat-unread', bookingId] })) }, [bookingId, qc])

  useEffect(() => {
    markRead()
    const ch = supabase.channel(`chat-${bookingId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_messages', filter: `booking_id=eq.${bookingId}` }, (p) => {
        void qc.invalidateQueries({ queryKey: ['chat', bookingId] })
        if (p.eventType === 'INSERT' && (p.new as ChatMsg).sender_id !== me) markRead()
      }).subscribe()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { void supabase.removeChannel(ch); document.body.style.overflow = prev }
  }, [bookingId, qc, markRead, me])
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }) }, [q.data?.length])

  const send = async (body: string | null, image: string | null) => {
    const r = await supabase.rpc('send_booking_message', { p_booking_id: bookingId, p_body: body, p_image_path: image })
    if (r.error) throw r.error
    void qc.invalidateQueries({ queryKey: ['chat', bookingId] })
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const t = text.trim()
    if (!t || busy) return
    setBusy(true); setText('')
    try { await send(t, null) } catch (err) { toast.error(friendlyError(err)); setText(t) }
    setBusy(false)
  }
  const pickPhoto = async (f: File | undefined) => {
    if (!f) return
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return toast.error('Please choose a JPG, PNG or WebP photo.')
    setBusy(true)
    try {
      const blob = await shrink(f)
      const path = `${bookingId}/${crypto.randomUUID()}.${blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg'}`
      const up = await supabase.storage.from('chat-media').upload(path, blob, { contentType: blob.type })
      if (up.error) throw up.error
      await send(null, path)
    } catch (err) { toast.error(friendlyError(err)) }
    setBusy(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const msgs = q.data ?? []
  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-plum-950/50 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={`Chat with ${title}`} className="animate-pop flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-[85vh] sm:max-w-md sm:rounded-3xl">
        <div className="flex items-center gap-3 bg-gradient-to-r from-lush-600 to-plum-700 px-4 py-3 text-white">
          <MessageCircle className="h-5 w-5 shrink-0" />
          <div className="min-w-0 flex-1"><p className="truncate font-semibold">{title}</p><p className="text-xs opacity-80">Booking chat</p></div>
          {phone && <a href={`tel:${phone}`} aria-label="Call" className="rounded-full bg-white/20 p-2 hover:bg-white/30"><Phone className="h-4 w-4" /></a>}
          <button type="button" aria-label="Close chat" onClick={onClose} className="rounded-full p-2 hover:bg-white/20"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto bg-blush-50 p-3">
          {q.isLoading ? <p className="py-8 text-center text-sm text-muted">Loading…</p> : msgs.length === 0 ? <p className="py-10 text-center text-sm text-muted">No messages yet. Say hello 👋</p> : msgs.map((m) => {
            const mine = m.sender_id === me
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${mine ? 'rounded-br-sm bg-lush-600 text-white' : 'rounded-bl-sm bg-white text-plum-900'}`}>
                  {m.image_path && <div className="mb-1"><Photo path={m.image_path} /></div>}
                  {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                  <div className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${mine ? 'text-white/80' : 'text-muted'}`}>{fmtTime(m.created_at)}{mine && <Ticks m={m} />}</div>
                </div>
              </div>)
          })}
          <div ref={bottom} />
        </div>
        <form onSubmit={submit} className="flex items-center gap-2 border-t border-line bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void pickPhoto(e.target.files?.[0])} />
          <button type="button" aria-label="Share photo" disabled={busy} onClick={() => fileRef.current?.click()} className="rounded-full p-2.5 text-lush-600 hover:bg-blush-100"><ImagePlus className="h-5 w-5" /></button>
          <input className="input flex-1 !rounded-full !py-2.5" placeholder="Type a message" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} />
          <button aria-label="Send" disabled={busy || !text.trim()} className="rounded-full bg-lush-600 p-2.5 text-white disabled:opacity-50"><Send className="h-5 w-5" /></button>
        </form>
      </div>
    </div>, document.body)
}
