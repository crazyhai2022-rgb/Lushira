import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock, Heart, Home, MapPin, Navigation, Phone, Plus, Check, ShoppingBag, ShieldCheck } from 'lucide-react'
import { getSalonBrandServices, getSalonBySlug, getSalonReviews, categoryImage } from '../lib/api'
import { EmptyState, ErrorState, Skeleton, Stars } from '../components/ui'
import MapView from '../components/MapView'
import { useCart } from '../context/CartContext'
import { useAuth } from '../context/AuthContext'
import { usePlace } from '../context/LocationContext'
import { useToast } from '../context/ToastContext'
import { useAddToCart } from '../hooks/useAddToCart'
import { addRecentSalon } from '../lib/recent'
import { distance, duration, fmtDate, inr } from '../lib/format'
import { publicUrl, supabase } from '../lib/supabase'
import { friendlyError } from '../lib/errors'
import type { SalonService } from '../lib/types'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const hhmm = (t: string | null) => {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}
const haversine = (a: [number, number], b: [number, number]) => {
  const R = 6371000, rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1])
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

export default function SalonDetails() {
  const { slug = '' } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuth()
  const toast = useToast()
  const cart = useCart()
  const loc = usePlace()
  const addToCart = useAddToCart()
  const [tab, setTab] = useState<'services' | 'about' | 'gallery' | 'reviews' | 'location'>('services')

  const q = useQuery({ queryKey: ['salon', slug], queryFn: () => getSalonBySlug(slug) })
  const s = q.data
  const brands = useQuery({ queryKey: ['salon-brands', s?.id], queryFn: () => getSalonBrandServices(s!.id), enabled: !!s })
  const reviews = useQuery({ queryKey: ['salon-reviews', s?.id], queryFn: () => getSalonReviews(s!.id), enabled: !!s })
  const fav = useQuery({
    queryKey: ['fav', s?.id, user?.id],
    enabled: !!s && !!user,
    queryFn: async () => (await supabase.from('favorites').select('salon_id').eq('salon_id', s!.id).maybeSingle()).data != null,
  })
  const toggleFav = useMutation({
    mutationFn: async () => {
      if (!user) { nav(`/signup?next=/salon/${slug}`); return }
      if (fav.data) await supabase.from('favorites').delete().eq('salon_id', s!.id).eq('user_id', user.id)
      else { const r = await supabase.from('favorites').insert({ salon_id: s!.id, user_id: user.id }); if (r.error) throw r.error }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fav'] }); qc.invalidateQueries({ queryKey: ['favorites'] }) },
    onError: (e) => toast.error(friendlyError(e)),
  })

  useEffect(() => {
    if (s) addRecentSalon({ slug: s.slug, name: s.name, image: publicUrl(s.cover_url ?? s.logo_url), area: [s.area, s.city].filter(Boolean).join(', ') })
  }, [s])

  const grouped = useMemo(() => {
    const m = new Map<string, SalonService[]>()
    ;(s?.salon_services ?? []).forEach((x) => {
      const k = x.service_categories?.name ?? 'Other services'
      m.set(k, [...(m.get(k) ?? []), x])
    })
    return [...m.entries()]
  }, [s])

  if (q.isLoading) return <div className="container-x space-y-4 py-6"><Skeleton className="h-56" /><Skeleton className="h-24" /><Skeleton className="h-64" /></div>
  if (q.isError) return <div className="container-x py-10"><ErrorState onRetry={() => q.refetch()} /></div>
  if (!s) return <div className="container-x py-10"><EmptyState title="Salon not found" text="This salon may have been removed or is not available yet." action={<Link to="/salons" className="btn btn-primary btn-sm">Explore salons</Link>} /></div>

  const cover = publicUrl(s.cover_url) ?? publicUrl(s.salon_images?.[0]?.url) ?? '/img/hero-beauty.jpg'
  const dist = loc.place && s.lat != null && s.lng != null ? haversine([loc.place.lat, loc.place.lng], [s.lat, s.lng]) : null
  const here = cart.salon?.id === s.id ? cart : null
  const cartSalon = { id: s.id, name: s.name, slug: s.slug, homeService: s.home_service, logo: s.logo_url }
  const add = (x: SalonService) => addToCart(cartSalon, { id: x.id, name: x.name, price: Number(x.price_inr), duration: x.duration_min, atSalon: x.at_salon, atHome: x.at_home && s.home_service, image: x.image_url })
  const tabs = [['services', 'Services'], ['about', 'About'], ['gallery', 'Gallery'], ['reviews', 'Reviews'], ['location', 'Location']] as const
  const directions = s.lat != null ? `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}` : undefined

  return (
    <div className={here ? 'pb-20' : ''}>
      <div className="relative h-48 bg-blush-100 sm:h-72">
        <img src={cover} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-plum-950/50 to-transparent" />
      </div>
      <div className="container-x -mt-12 relative">
        <div className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-6">
          <div className="-mt-12 h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-4 border-white bg-blush-100 shadow-md sm:mt-0 sm:h-24 sm:w-24">
            {s.logo_url ? <img src={publicUrl(s.logo_url)!} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center font-display text-3xl text-lush-500">{s.name.charAt(0)}</div>}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold sm:text-3xl">{s.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <Stars value={Number(s.rating_avg)} count={s.rating_count} />
              <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{[s.address_line, s.area, s.city].filter(Boolean).join(', ')}</span>
              {dist != null && <span className="chip">{distance(dist)} away</span>}
              {s.home_service && <span className="chip"><Home className="h-3 w-3" />At-home service</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={() => { setTab('services'); document.getElementById('tabs')?.scrollIntoView({ behavior: 'smooth' }) }}>Book now</button>
            <button className="btn btn-outline" onClick={() => toggleFav.mutate()} aria-pressed={!!fav.data} aria-label="Save salon"><Heart className={`h-4 w-4 ${fav.data ? 'fill-lush-600' : ''}`} /></button>
            {s.contact_phone && <a className="btn btn-outline" href={`tel:${s.contact_phone}`} aria-label="Call salon"><Phone className="h-4 w-4" /></a>}
            {directions && <a className="btn btn-outline" href={directions} target="_blank" rel="noreferrer" aria-label="Directions"><Navigation className="h-4 w-4" /></a>}
          </div>
        </div>

        <div id="tabs" className="mt-6 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
          {tabs.map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-semibold ${tab === k ? 'border-lush-600 text-lush-600' : 'border-transparent text-muted hover:text-plum-800'}`}>{l}</button>
          ))}
        </div>

        <div className="py-6">
          {tab === 'services' && (
            <div className="space-y-8">
              {grouped.length === 0 && <EmptyState title="No services listed yet" text="This salon has not published its price list." />}
              {grouped.map(([cat, list]) => (
                <section key={cat}>
                  <h2 className="mb-3 font-display text-xl font-semibold">{cat}</h2>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {list.map((x) => {
                      const inCart = cart.items.some((i) => i.id === x.id)
                      return (
                        <div key={x.id} className="card flex gap-3 p-3">
                          <Link to={`/service/${x.id}`} className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-blush-100">
                            <img src={publicUrl(x.image_url) ?? categoryImage(x.service_categories?.slug)} alt="" loading="lazy" className="h-full w-full object-cover" />
                          </Link>
                          <div className="min-w-0 flex-1">
                            <Link to={`/service/${x.id}`} className="font-semibold hover:text-lush-600">{x.name}</Link>
                            <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
                              <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{duration(x.duration_min)}</span>
                              {x.at_home && s.home_service && <span className="inline-flex items-center gap-1"><Home className="h-3.5 w-3.5" />Home</span>}
                            </div>
                            {x.description && <p className="mt-1 line-clamp-1 text-xs text-muted">{x.description}</p>}
                            <div className="mt-1.5 flex items-center justify-between">
                              <span className="font-bold text-plum-900">{inr(x.price_inr)}</span>
                              <button className={`btn btn-sm ${inCart ? 'btn-outline' : 'btn-primary'}`} onClick={() => add(x)}>{inCart ? <><Check className="h-3.5 w-3.5" />Added</> : <><Plus className="h-3.5 w-3.5" />Add</>}</button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              ))}
              {(brands.data?.length ?? 0) > 0 && (
                <section>
                  <h2 className="mb-1 font-display text-xl font-semibold">Brands available here</h2>
                  <p className="mb-3 flex items-center gap-1 text-xs text-muted"><ShieldCheck className="h-4 w-4 text-emerald-600" />Verified by Lushira</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {brands.data!.map((b) => (
                      <div key={b.id} className="card flex items-center gap-3 p-3">
                        {b.brand_services.brands.logo_url ? <img src={publicUrl(b.brand_services.brands.logo_url)!} alt="" className="h-10 w-10 object-contain" /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blush-100 font-display text-lush-600">{b.brand_services.brands.name.charAt(0)}</span>}
                        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{b.brand_services.name}</p><p className="text-xs text-muted">{b.brand_services.brands.name}</p></div>
                        {b.brand_services.price_inr != null && <span className="text-sm font-bold">{inr(b.brand_services.price_inr)}</span>}
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {(s.salon_staff?.length ?? 0) > 0 && (
                <section>
                  <h2 className="mb-3 font-display text-xl font-semibold">Our beauticians</h2>
                  <div className="flex gap-4 overflow-x-auto pb-1">
                    {s.salon_staff!.map((m) => (
                      <div key={m.id} className="w-24 shrink-0 text-center">
                        <div className="mx-auto h-16 w-16 overflow-hidden rounded-full bg-blush-100">{m.photo_url ? <img src={publicUrl(m.photo_url)!} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center font-display text-xl text-lush-500">{m.name.charAt(0)}</div>}</div>
                        <p className="mt-1 truncate text-sm font-semibold">{m.name}</p><p className="truncate text-xs text-muted">{m.role_title}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {tab === 'about' && (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="card p-5">
                <h2 className="mb-2 font-display text-xl font-semibold">About {s.name}</h2>
                <p className="text-sm text-muted">{s.description ?? 'This salon has not added a description yet.'}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {s.home_service && <span className="chip">Home service</span>}
                  {s.appointment_required && <span className="chip">Appointment required</span>}
                  {s.walk_in && <span className="chip">Walk-ins welcome</span>}
                  {Object.entries(s.facilities ?? {}).filter(([, v]) => v).map(([k]) => <span key={k} className="chip">{k}</span>)}
                </div>
                <h3 className="mb-1 mt-5 font-display text-lg font-semibold">Cancellation policy</h3>
                <p className="text-sm text-muted">{s.cancellation_policy ?? 'Free cancellation until 4 hours before your appointment. Later cancellations may not be refundable. See our '}{!s.cancellation_policy && <Link to="/refund-policy" className="text-lush-600 underline">Cancellation & Refund Policy</Link>}</p>
              </div>
              <div className="card p-5">
                <h2 className="mb-3 font-display text-xl font-semibold">Opening hours</h2>
                <ul className="space-y-1.5 text-sm">
                  {(s.salon_business_hours ?? []).map((h) => (
                    <li key={h.id} className="flex justify-between"><span className="text-muted">{DAYS[h.weekday]}</span><span className="font-medium">{h.is_closed ? 'Closed' : `${hhmm(h.opens)} – ${hhmm(h.closes)}`}</span></li>
                  ))}
                  {!s.salon_business_hours?.length && <li className="text-muted">Hours not provided.</li>}
                </ul>
              </div>
            </div>
          )}

          {tab === 'gallery' && (
            (s.salon_images?.length ?? 0) === 0 ? <EmptyState title="No photos yet" /> :
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {s.salon_images!.sort((a, b) => a.sort_order - b.sort_order).map((im) => <img key={im.id} src={publicUrl(im.url)!} alt="" loading="lazy" className="aspect-square w-full rounded-2xl object-cover" />)}
              </div>
          )}

          {tab === 'reviews' && (
            reviews.isLoading ? <Skeleton className="h-32" /> :
              (reviews.data?.length ?? 0) === 0 ? <EmptyState icon={<ShoppingBag className="h-6 w-6" />} title="No reviews yet" text="Book a service and be the first to share your experience." /> :
                <div className="grid gap-3 lg:grid-cols-2">
                  {reviews.data!.map((r) => (
                    <div key={r.id} className="card p-4"><div className="flex items-center justify-between"><Stars value={r.rating} /><span className="text-xs text-muted">{fmtDate(r.created_at)}</span></div>
                      {r.comment && <p className="mt-2 text-sm">{r.comment}</p>}</div>
                  ))}
                </div>
          )}

          {tab === 'location' && (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm"><MapPin className="h-4 w-4 text-lush-600" />{[s.address_line, s.landmark, s.area, s.city, s.state, s.pin_code].filter(Boolean).join(', ')}</p>
              {s.lat != null && s.lng != null ? <MapView center={[s.lat, s.lng]} zoom={15} height={320} markers={[{ id: s.id, lat: s.lat, lng: s.lng, label: s.name }]} /> : <EmptyState title="Map unavailable" />}
              {directions && <a className="btn btn-primary" href={directions} target="_blank" rel="noreferrer"><Navigation className="h-4 w-4" />Get directions</a>}
            </div>
          )}
        </div>
      </div>

      {here && (
        <div className="fixed inset-x-0 bottom-16 z-30 px-4 lg:bottom-4">
          <Link to="/cart" className="btn btn-primary mx-auto flex max-w-xl justify-between !rounded-2xl !py-3.5">
            <span className="inline-flex items-center gap-2"><ShoppingBag className="h-4 w-4" />{here.count} service{here.count > 1 ? 's' : ''} · {inr(here.subtotal)}</span><span>View cart →</span>
          </Link>
        </div>
      )}
    </div>
  )
}
