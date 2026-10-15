import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal } from './ui'
import { supabase } from '../lib/supabase'
import { friendlyError } from '../lib/errors'
import { useToast } from '../context/ToastContext'
import { paymentLabel, statusLabel } from '../lib/format'
import type { BookingStatus } from '../lib/types'

const TONE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800', confirmed: 'bg-blue-100 text-blue-800', provider_assigned: 'bg-blue-100 text-blue-800',
  on_the_way: 'bg-indigo-100 text-indigo-800', in_progress: 'bg-purple-100 text-purple-800', completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-200 text-gray-700', rejected: 'bg-red-100 text-red-700', no_show: 'bg-gray-200 text-gray-700',
}
export const StatusBadge = ({ status }: { status: BookingStatus }) => (
  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[status] ?? 'bg-gray-100'}`}>{statusLabel[status] ?? status}</span>
)
export const PayBadge = ({ status }: { status: string }) => (
  <span className="inline-flex rounded-full bg-blush-100 px-2.5 py-0.5 text-xs font-medium text-plum-800">{paymentLabel[status] ?? status}</span>
)

export const CANCELLABLE: BookingStatus[] = ['pending', 'confirmed', 'provider_assigned']
export const ACTIVE: BookingStatus[] = ['pending', 'confirmed', 'provider_assigned', 'on_the_way', 'in_progress']

/** Cancel dialog + mutation shared by orders and tracking pages. */
export function useCancelBooking() {
  const qc = useQueryClient()
  const toast = useToast()
  const [target, setTarget] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const m = useMutation({
    mutationFn: async () => {
      const r = await supabase.rpc('cancel_booking', { p_booking_id: target, p_reason: reason.trim() || null })
      if (r.error) throw r.error
      return r.data as { refund?: boolean } | null
    },
    onSuccess: () => {
      toast.success('Booking cancelled.')
      setTarget(null); setReason('')
      void qc.invalidateQueries({ queryKey: ['bookings'] }); void qc.invalidateQueries({ queryKey: ['booking'] })
    },
    onError: (e) => toast.error(friendlyError(e)),
  })
  const dialog = (
    <Modal open={!!target} onClose={() => setTarget(null)} title="Cancel this booking?">
      <p className="text-sm text-muted">Refunds for online payments follow the cancellation window set in our refund policy.</p>
      <label className="mt-3 block"><span className="label">Reason (optional)</span>
        <textarea className="input min-h-20" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn btn-ghost" onClick={() => setTarget(null)}>Keep booking</button>
        <button className="btn btn-primary" disabled={m.isPending} onClick={() => m.mutate()}>{m.isPending ? 'Cancelling…' : 'Cancel booking'}</button>
      </div>
    </Modal>
  )
  return { ask: (id: string) => setTarget(id), dialog }
}
