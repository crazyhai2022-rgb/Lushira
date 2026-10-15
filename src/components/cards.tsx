import { Link } from 'react-router-dom'
import { Clock, Home, MapPin, Plus, Check } from 'lucide-react'
import type { Category, SalonLite, ServiceHit } from '../lib/types'
import { categoryImage } from '../lib/api'
import { distance, duration, inr } from '../lib/format'
import { publicUrl } from '../lib/supabase'
import { Stars, VerifiedBadge } from './ui'

export function CategoryCard({ c, compact }: { c: Category; compact?: boolean }) {
  return (
    <Link to={`/services?category=${c.slug}`} className="card group block overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className={`overflow-hidden ${compact ? 'aspect-[4/3]' : 'aspect-[16/9]'}`}>
        <img src={publicUrl(c.image_url) ?? categoryImage(c.slug)} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
      </div>
      <div className="p-3 text-center">
        <h3 className="font-display text-base font-semibold sm:text-lg">{c.name}</h3>
        {!compact && c.description && <p className="mt-1 line-clamp-2 text-xs text-muted">{c.description}</p>}
        {!compact && <span className="mt-2 inline-block text-xs font-semibold text-lush-600">View Services →</span>}
      </div>
    </Link>
  )
}

export function SalonCard({ s }: { s: SalonLite }) {
  const img = publicUrl(s.cover_url) ?? publicUrl(s.logo_url)
  return (
    <Link to={`/salon/${s.slug}`} className="card group block overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="relative aspect-[16/10] overflow-hidden bg-blush-100">
        {img ? <img src={img} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> :
          <div className="flex h-full items-center justify-center font-display text-4xl text-lush-400">{s.name.charAt(0)}</div>}
        {s.featured && <span className="absolute left-2 top-2 rounded-full bg-lush-600 px-2.5 py-0.5 text-[11px] font-semibold text-white">Featured</span>}
        {s.distance_m != null && <span className="absolute right-2 top-2 rounded-full bg-white/95 px-2.5 py-0.5 text-[11px] font-semibold text-plum-800">{distance(s.distance_m)}</span>}
      </div>
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-lg font-semibold leading-tight">{s.name}{s.verified && <> <VerifiedBadge /></>}</h3>
          <Stars value={Number(s.rating_avg)} count={s.rating_count} />
        </div>
        <p className="mt-1 flex items-center gap-1 text-xs text-muted"><MapPin className="h-3.5 w-3.5 shrink-0" />{[s.area, s.city].filter(Boolean).join(', ') || s.address_line}</p>
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="font-semibold text-plum-800">{s.min_price != null ? `From ${inr(s.min_price)}` : 'View prices'}</span>
          {s.home_service && <span className="chip"><Home className="h-3 w-3" />At home</span>}
        </div>
      </div>
    </Link>
  )
}

export function ServiceCard({ s, inCart, onAdd, showSalon = true }: { s: ServiceHit; inCart?: boolean; onAdd: () => void; showSalon?: boolean }) {
  const img = publicUrl(s.image_url) ?? categoryImage(s.category_slug)
  return (
    <div className="card flex overflow-hidden">
      <Link to={`/service/${s.id}`} className="block w-28 shrink-0 sm:w-36">
        <img src={img} alt="" loading="lazy" className="h-full w-full object-cover" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col p-3">
        <Link to={`/service/${s.id}`} className="font-display text-base font-semibold leading-snug hover:text-lush-600">{s.name}</Link>
        {showSalon && (
          <Link to={`/salon/${s.salon_slug}`} className="mt-0.5 truncate text-xs text-muted hover:underline">
            {s.salon_name}{s.distance_m != null && ` · ${distance(s.distance_m)}`}
          </Link>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{duration(s.duration_min)}</span>
          <Stars value={Number(s.rating_avg)} count={s.rating_count} size="h-3.5 w-3.5" />
          {s.at_home && <span className="chip py-0.5"><Home className="h-3 w-3" />Home</span>}
        </div>
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="text-base font-bold text-plum-900">{inr(s.price_inr)}</span>
          <button onClick={onAdd} className={`btn btn-sm ${inCart ? 'btn-outline' : 'btn-primary'}`} aria-label={`Add ${s.name} to cart`}>
            {inCart ? <><Check className="h-3.5 w-3.5" />Added</> : <><Plus className="h-3.5 w-3.5" />Add</>}
          </button>
        </div>
      </div>
    </div>
  )
}
