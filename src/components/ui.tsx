import { useEffect, useRef, type ReactNode } from 'react'
import { AlertTriangle, Loader2, Star, X } from 'lucide-react'
import { Link } from 'react-router-dom'

export function Logo({ className = 'h-10' }: { className?: string }) {
  return (
    <img
      src="/brand/logo.jpg"
      alt="Lushira – Beauty at your doorstep"
      className={`${className} w-auto rounded-lg object-contain`}
      width={81}
      height={40}
    />
  )
}

export function LogoMark({ size = 'h-10 w-10 sm:h-11 sm:w-11', text = true, light = false }: { size?: string; text?: boolean; light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className={`${size} flex shrink-0 items-center justify-center rounded-xl bg-logo p-1.5 shadow-md shadow-plum-900/20`}>
        <img src="/brand/logo-mark.png" alt={text ? '' : 'Lushira'} width={40} height={40} className="h-full w-full object-contain" />
      </span>
      {text && (
        <span className="leading-none">
          <span className={`block font-display text-[15px] font-semibold tracking-[0.1em] sm:text-xl sm:tracking-[0.14em] ${light ? 'text-white' : 'text-plum-900'}`}>LUSHIRA</span>
          <span className={`mt-1 hidden text-[8px] font-medium uppercase tracking-[0.2em] sm:block ${light ? 'text-gold-300' : 'text-gold-500'}`}>Beauty at your doorstep</span>
        </span>
      )}
    </span>
  )
}

export const Spinner = ({ className = 'h-5 w-5' }: { className?: string }) => <Loader2 className={`${className} animate-spin`} aria-label="Loading" />

export const Skeleton = ({ className = '' }: { className?: string }) => <div className={`skeleton rounded-xl ${className}`} aria-hidden />

export function CardSkeletonGrid({ count = 4, className = 'h-56' }: { count?: number; className?: string }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => <Skeleton key={i} className={className} />)}
    </div>
  )
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
      {icon && <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blush-100 text-lush-600">{icon}</div>}
      <h3 className="font-display text-xl font-semibold">{title}</h3>
      {text && <p className="max-w-md text-sm text-muted">{text}</p>}
      {action}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="card flex flex-col items-center gap-3 border-red-100 px-6 py-10 text-center">
      <AlertTriangle className="h-8 w-8 text-red-500" />
      <p className="text-sm text-ink">{message ?? 'We could not load this. Please try again.'}</p>
      {onRetry && <button className="btn btn-outline btn-sm" onClick={onRetry}>Try again</button>}
    </div>
  )
}

export function Stars({ value, count, size = 'h-4 w-4' }: { value: number; count?: number; size?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm" aria-label={`Rated ${value.toFixed(1)} out of 5`}>
      <Star className={`${size} fill-amber-400 text-amber-400`} />
      <span className="font-semibold">{value > 0 ? value.toFixed(1) : 'New'}</span>
      {count != null && count > 0 && <span className="text-muted">({count})</span>}
    </span>
  )
}

export function StarInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => onChange(n)}>
          <Star className={`h-8 w-8 ${n <= value ? 'fill-amber-400 text-amber-400' : 'text-blush-300'}`} />
        </button>
      ))}
    </div>
  )
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      prev?.focus?.()
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-plum-950/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
        className={`animate-pop max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl outline-none sm:rounded-3xl sm:p-6 ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">{title}</h2>
          <button aria-label="Close" onClick={onClose} className="rounded-full p-1 text-muted hover:bg-blush-100"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Field({ label, error, hint, required, children }: { label: string; error?: string; hint?: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}{required && <span className="text-lush-600"> *</span>}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span role="alert" className="mt-1 block text-xs font-medium text-red-600">{error}</span>}
    </label>
  )
}

export function PageHero({ eyebrow, title, subtitle, image, children }: { eyebrow?: string; title: string; subtitle?: string; image?: string; children?: ReactNode }) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-r from-blush-100 via-blush-100 to-blush-200">
      {image && <img src={image} alt="" className="pointer-events-none absolute inset-y-0 right-0 hidden h-full w-1/2 object-cover object-top opacity-90 md:block [mask-image:linear-gradient(to_right,transparent,black_35%)]" />}
      <div className="container-x relative py-10 sm:py-14">
        {eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-lush-600">{eyebrow}</p>}
        <h1 className="max-w-xl text-3xl font-semibold sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-lg text-muted">{subtitle}</p>}
        {children && <div className="mt-5">{children}</div>}
      </div>
    </section>
  )
}

export function SectionHeader({ title, to, linkText = 'View all' }: { title: string; to?: string; linkText?: string }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <h2 className="section-title">{title}</h2>
      {to && <Link to={to} className="shrink-0 text-sm font-semibold text-lush-600 hover:underline">{linkText} →</Link>}
    </div>
  )
}
