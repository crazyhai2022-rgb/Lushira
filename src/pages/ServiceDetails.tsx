import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Clock, Home, MapPin, ShieldCheck, Store } from 'lucide-react'
import { getServiceById, categoryImage } from '../lib/api'
import { duration, inr } from '../lib/format'
import { publicUrl } from '../lib/supabase'
import { ErrorState, Skeleton, Stars, EmptyState } from '../components/ui'
import { useAddToCart } from '../hooks/useAddToCart'
import { useCart } from '../context/CartContext'

export default function ServiceDetails() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const cart = useCart()
  const add = useAddToCart()
  const q = useQuery({ queryKey: ['service', id], queryFn: () => getServiceById(id) })

  if (q.isLoading) return <div className="container-x py-8"><Skeleton className="h-72" /></div>
  if (q.isError) return <div className="container-x py-8"><ErrorState onRetry={() => q.refetch()} /></div>
  const s = q.data
  if (!s || s.salons.status !== 'approved') {
    return <div className="container-x py-12"><EmptyState title="Service not found" text="This service is no longer available." action={<Link to="/services" className="btn btn-primary btn-sm">Browse services</Link>} /></div>
  }
  const salon = s.salons
  const inCart = cart.items.some((i) => i.id === s.id)
  const addNow = () =>
    add({ id: salon.id, name: salon.name, slug: salon.slug, homeService: salon.home_service, logo: salon.logo_url },
      { id: s.id, name: s.name, price: Number(s.price_inr), duration: s.duration_min, atSalon: s.at_salon, atHome: s.at_home && salon.home_service, image: s.image_url })

  return (
    <div className="container-x py-6">
      <nav aria-label="Breadcrumb" className="mb-4 text-xs text-muted">
        <Link to="/" className="hover:underline">Home</Link> › <Link to="/services" className="hover:underline">Services</Link>
        {s.service_categories && <> › <Link to={`/services?category=${s.service_categories.slug}`} className="hover:underline">{s.service_categories.name}</Link></>} › {s.name}
      </nav>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <img src={publicUrl(s.image_url) ?? categoryImage(s.service_categories?.slug)} alt={s.name} className="aspect-[4/3] w-full rounded-3xl object-cover" />
        <div>
          {s.service_categories && <span className="chip">{s.service_categories.name}</span>}
          <h1 className="mt-2 text-3xl font-semibold">{s.name}</h1>
          <p className="mt-3 text-muted">{s.description || 'Professional service delivered by verified beauty experts.'}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-1"><Clock className="h-4 w-4 text-lush-600" />{duration(s.duration_min)}</span>
            {s.at_salon && <span className="chip"><Store className="h-3.5 w-3.5" />At salon</span>}
            {s.at_home && salon.home_service && <span className="chip"><Home className="h-3.5 w-3.5" />At home</span>}
          </div>
          <p className="mt-5 font-display text-3xl font-semibold text-lush-600">{inr(s.price_inr)}</p>
          <p className="text-xs text-muted">Taxes calculated at checkout.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button className="btn btn-primary" onClick={() => { if (addNow()) nav('/cart') }}>Book Now</button>
            <button className="btn btn-outline" onClick={addNow} disabled={inCart}>{inCart ? 'In cart' : 'Add to cart'}</button>
          </div>
          <Link to={`/salon/${salon.slug}`} className="card mt-6 flex items-center gap-3 p-4 hover:shadow-md">
            <img src={publicUrl(salon.logo_url) ?? '/icons/icon-192.png'} alt="" className="h-14 w-14 rounded-xl object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{salon.name}</p>
              <p className="flex items-center gap-1 truncate text-xs text-muted"><MapPin className="h-3.5 w-3.5" />{[salon.area, salon.city].filter(Boolean).join(', ')}</p>
              <Stars value={Number(salon.rating_avg)} count={salon.rating_count} />
            </div>
            <span className="text-sm font-semibold text-lush-600">View →</span>
          </Link>
          <p className="mt-4 flex items-start gap-2 text-xs text-muted"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-lush-600" />{salon.cancellation_policy || 'Free cancellation before the cancellation window. See our refund policy for details.'}</p>
        </div>
      </div>
    </div>
  )
}
