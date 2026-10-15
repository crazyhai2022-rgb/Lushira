export const inr = (n: number | string | null | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(n ?? 0))

export const inrExact = (n: number | string | null | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(Number(n ?? 0))

export function duration(mins: number) {
  if (mins < 60) return `${mins} mins`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h} hr ${m} min` : `${h} ${h === 1 ? 'Hour' : 'Hours'}`
}

export function distance(meters: number | null | undefined) {
  if (meters == null) return ''
  return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1)} km`
}

const TZ = 'Asia/Kolkata'
export const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: TZ }).format(new Date(iso))
export const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: TZ }).format(new Date(iso))
export const fmtDateTime = (iso: string) => `${fmtDate(iso)} · ${fmtTime(iso)}`

/** yyyy-mm-dd for "today + n days" in IST (slots are computed in IST on the server). */
export function istDate(offsetDays = 0) {
  const now = new Date(Date.now() + offsetDays * 86400000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now)
}
export const dayLabel = (ymd: string) =>
  new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' }).format(new Date(ymd + 'T00:00:00Z'))

export const normalizePhone = (raw: string) => {
  const d = raw.replace(/[^\d+]/g, '')
  if (/^\+\d{10,15}$/.test(d)) return d
  const digits = d.replace(/\D/g, '')
  if (digits.length === 10) return `+91${digits}`
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`
  return null
}

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)

export const statusLabel: Record<string, string> = {
  pending: 'Awaiting salon',
  confirmed: 'Confirmed',
  provider_assigned: 'Provider assigned',
  on_the_way: 'On the way',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
  no_show: 'No show',
}
export const paymentLabel: Record<string, string> = {
  unpaid: 'Payment pending',
  pending: 'Payment pending',
  paid: 'Paid',
  failed: 'Payment failed',
  refund_pending: 'Refund pending',
  refunded: 'Refunded',
  cash_due: 'Cash due on service',
  cash_collected: 'Cash collected',
}
