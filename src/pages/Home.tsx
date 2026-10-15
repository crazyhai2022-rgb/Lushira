import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CalendarCheck, Heart, LocateFixed, MapPin, Navigation, Search, Store } from 'lucide-react'
import { getBanners, getBrands, getCategories, getNearbySalons, getSalonList, searchServices } from '../lib/api'
import { CategoryCard, SalonCard, ServiceCard } from '../components/cards'
import { CardSkeletonGrid, EmptyState, ErrorState, SectionHeader, Skeleton } from '../components/ui'
import { usePlace } from '../context/LocationContext'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { useAddToCart } from '../hooks/useAddToCart'
import { useSettings } from '../hooks/useSettings'
import { getRecentSalons } from '../lib/recent'
import { publicUrl } from '../lib/supabase'
import { getMyBookings } from '../lib/api'
import { statusLabel, fmtDateTime } from '../lib/format'

function Hero() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const banners = useQuery({ queryKey: ['banners'], queryFn: getBanners })
  const submit = (e: FormEvent) => { e.preventDefault(); nav(`/services${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`) }
  const b = banners.data?.[0]
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-blush-100 via-blush-50 to-blush-200">
      <img src={publicUrl(b?.image_url) ?? '/img/hero-beauty.jpg'} alt="" className="pointer-events-none absolute inset-y-0 right-0 h-full w-full object-cover object-right opacity-30 sm:w-3/5 sm:opacity-100 sm:[mask-image:linear-gradient(to_right,transparent,black_40%)]" />
      <div className="container-x relative py-10 sm:py-16">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-lush-600">Beauty at your doorstep</p>
        <h1 className="max-w-lg text-4xl font-semibold leading-tight sm:text-5xl">{b?.title ?? 'Look good. Feel confident. Be you.'}</h1>
        <p className="mt-3 max-w-md text-muted">{b?.subtitle ?? 'Book trusted salons, parlours and at-home beauty experts near you.'}</p>
        <form onSubmit={submit} className="mt-6 flex max-w-xl items-center gap-2 rounded-full border border-blush-300 bg-white p-1.5 shadow-lg shadow-lush-600/10" role="search">
          <Search className="ml-3 h-5 w-5 shrink-0 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search salons, services, brands…" aria-label="Search" className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm outline-none placeholder:text-muted/70" />
          <button className="btn btn-primary btn-sm sm:px-6">Search</button>
        </form>
        <div className="mt-5 flex flex-wrap gap-2 text-xs">
          {['Facial', 'Haircut', 'Bridal makeup', 'Manicure', 'Waxing'].map((t) => (
            <Link key={t} to={`/services?q=${encodeURIComponent(t)}`} className="chip hover:bg-blush-200">{t}</Link>
          ))}
        </div>
      </div>
    </section>
  )
}

function LocationPrompt() {
  const loc = usePlace()
  const { radiusKm } = useSettings()
  return (
    <div className="card flex flex-col items-start gap-3 bg-gradient-to-r from-blush-100 to-white p-5 sm:flex-row sm:items-center">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-lush-600 shadow"><MapPin className="h-6 w-6" /></div>
      <div className="flex-1">
        <h3 className="font-display text-lg font-semibold">See salons within {radiusKm} km of you</h3>
        <p className="text-sm text-muted">Share your location or search your area. We only use it to find nearby salons.</p>
      </div>
      <div className="flex w-full gap-2 sm:w-auto">
        <button className="btn btn-primary flex-1 sm:flex-none" onClick={() => void loc.useCurrentLocation()} disabled={loc.loading}><LocateFixed className="h-4 w-4" />{loc.loading ? 'Locating…' : 'Use My Current Location'}</button>
        <button className="btn btn-outline flex-1 sm:flex-none" onClick={loc.openModal}>Search area</button>
      </div>
    </div>
  )
}

function Shortcuts() {
  const { user } = useAuth()
  const q = useQuery({ queryKey: ['my-bookings'], queryFn: getMyBookings, enabled: !!user, staleTime: 30_000 })
  const active = (q.data ?? []).find((b) => ['pending', 'confirmed', 'provider_assigned', 'on_the_way', 'in_progress'].includes(b.status) && new Date(b.scheduled_end) > new Date())
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {active ? (
        <Link to={`/track/${active.id}`} className="card flex items-center gap-3 border-lush-400 bg-blush-100 p-4 sm:col-span-1">
          <Navigation className="h-6 w-6 text-lush-600" />
          <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-lush-600">{statusLabel[active.status]}</p>
            <p className="truncate text-sm font-semibold">{active.salons?.name}</p><p className="text-xs text-muted">{fmtDateTime(active.scheduled_start)}</p></div>
        </Link>
      ) : (
        <Link to="/track" className="card flex items-center gap-3 p-4"><Navigation className="h-6 w-6 text-lush-600" /><div><p className="text-sm font-semibold">Track order</p><p className="text-xs text-muted">Live status of your booking</p></div></Link>
      )}
      <Link to="/orders" className="card flex items-center gap-3 p-4"><CalendarCheck className="h-6 w-6 text-lush-600" /><div><p className="text-sm font-semibold">My bookings</p><p className="text-xs text-muted">Upcoming, completed & rebook</p></div></Link>
      <Link to="/profile" className="card flex items-center gap-3 p-4"><Heart className="h-6 w-6 text-lush-600" /><div><p className="text-sm font-semibold">Saved salons</p><p className="text-xs text-muted">Your favourites in one place</p></div></Link>
    </div>
  )
}

export default function Home() {
  const loc = usePlace()
  const cart = useCart()
  const addToCart = useAddToCart()
  const { radiusKm } = useSettings()
  const place = loc.place

  const cats = useQuery({ queryKey: ['categories'], queryFn: getCategories, staleTime: 10 * 60 * 1000 })
  const nearby = useQuery({
    queryKey: ['nearby-home', place?.lat, place?.lng, radiusKm],
    queryFn: () => getNearbySalons({ lat: place!.lat, lng: place!.lng, limit: 6 }),
    enabled: !!place,
  })
  const popular = useQuery({
    queryKey: ['popular', place?.lat, place?.lng],
    queryFn: () => searchServices({ lat: place?.lat, lng: place?.lng, sort: 'rating', limit: 6 }),
  })
  const featured = useQuery({ queryKey: ['featured'], queryFn: () => getSalonList({ featured: true, limit: 8 }) })
  const brands = useQuery({ queryKey: ['brands'], queryFn: getBrands })
  const recent = getRecentSalons()

  return (
    <>
      <Hero />
      <div className="container-x space-y-12 py-8">
        <Shortcuts />
        {!place && <LocationPrompt />}

        <section>
          <SectionHeader title="Explore Categories" to="/categories" />
          {cats.isLoading ? <CardSkeletonGrid count={6} className="h-40" /> : cats.isError ? <ErrorState onRetry={() => cats.refetch()} /> : (
            <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-6">
              {(cats.data ?? []).slice(0, 12).map((c) => <div key={c.id} className="w-36 shrink-0 sm:w-auto"><CategoryCard c={c} compact /></div>)}
            </div>
          )}
        </section>

        {place && (
          <section>
            <SectionHeader title={`Salons near ${place.label.split(',')[0]}`} to="/salons" />
            <p className="-mt-2 mb-4 text-xs text-muted">Within {radiusKm} km of {place.source === 'gps' ? 'your current location' : 'the area you searched'}.</p>
            {nearby.isLoading ? <CardSkeletonGrid count={3} /> : nearby.isError ? <ErrorState onRetry={() => nearby.refetch()} /> :
              nearby.data && nearby.data.length ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{nearby.data.map((s) => <SalonCard key={s.id} s={s} />)}</div>
              ) : (
                <EmptyState icon={<Store className="h-6 w-6" />} title={`No salons within ${radiusKm} km yet`}
                  text="Lushira is growing. Try another area, or tell a salon owner you know to list their salon."
                  action={<div className="flex flex-wrap justify-center gap-2"><button className="btn btn-outline btn-sm" onClick={loc.openModal}>Change location</button><Link to="/partner" className="btn btn-primary btn-sm">Register a salon</Link></div>} />
              )}
          </section>
        )}

        <section>
          <SectionHeader title="Recommended Services" to="/services" />
          {popular.isLoading ? <CardSkeletonGrid count={3} className="h-36" /> : popular.isError ? <ErrorState onRetry={() => popular.refetch()} /> :
            popular.data && popular.data.length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {popular.data.map((s) => (
                  <ServiceCard key={s.id} s={s} inCart={cart.items.some((i) => i.id === s.id)}
                    onAdd={() => addToCart({ id: s.salon_id, name: s.salon_name, slug: s.salon_slug, homeService: s.at_home, logo: s.salon_logo },
                      { id: s.id, name: s.name, price: Number(s.price_inr), duration: s.duration_min, atSalon: s.at_salon, atHome: s.at_home, image: s.image_url })} />
                ))}
              </div>
            ) : <EmptyState icon={<Search className="h-6 w-6" />} title="Services will appear here" text="As soon as salons publish their services, the most popular ones show up on this page." />}
        </section>

        {(featured.data?.length ?? 0) > 0 && (
          <section>
            <SectionHeader title="Featured Salons" to="/salons" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{featured.data!.slice(0, 4).map((s) => <SalonCard key={s.id} s={s} />)}</div>
          </section>
        )}

        <section className="overflow-hidden rounded-3xl bg-gradient-to-r from-plum-900 to-plum-700 text-white">
          <div className="grid items-center sm:grid-cols-2">
            <div className="p-6 sm:p-10">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-gold-300">Your dream wedding look</p>
              <h2 className="font-display text-3xl font-semibold !text-white">Bridal makeup & wedding beauty</h2>
              <p className="mt-2 text-sm text-white/75">Bridal makeup, hairstyling, mehendi, pre-bridal care and complete packages — or request a custom quote.</p>
              <Link to="/wedding" className="btn mt-5 bg-white text-plum-900 hover:bg-blush-100">Explore Wedding Special <ArrowRight className="h-4 w-4" /></Link>
            </div>
            <img src="/img/hero-bridal.jpg" alt="" loading="lazy" className="h-48 w-full object-cover object-top sm:h-full" />
          </div>
        </section>

        {(brands.data?.length ?? 0) > 0 && (
          <section>
            <SectionHeader title="Popular Beauty Brands" to="/brands" />
            <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
              {brands.data!.map((b) => (
                <Link key={b.id} to={`/brands?brand=${b.slug}`} className="card flex w-36 shrink-0 flex-col items-center gap-2 p-4 text-center hover:shadow-lg">
                  {b.logo_url ? <img src={publicUrl(b.logo_url)!} alt={b.name} className="h-12 object-contain" /> : <span className="font-display text-2xl text-lush-600">{b.name.charAt(0)}</span>}
                  <span className="text-sm font-semibold">{b.name}</span><span className="text-xs text-muted">{b.brand_services?.length ?? 0} services</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="card flex flex-col items-start gap-3 bg-blush-100 p-6 sm:flex-row sm:items-center">
          <div className="flex-1"><h3 className="font-display text-xl font-semibold">Have a coupon?</h3><p className="text-sm text-muted">Enter your code in the cart to apply offers. Salon owners can create offers from their dashboard.</p></div>
          <Link to="/services" className="btn btn-primary">Book a service</Link>
        </section>

        {recent.length > 0 && (
          <section>
            <SectionHeader title="Recently Viewed" />
            <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
              {recent.map((r) => (
                <Link key={r.slug} to={`/salon/${r.slug}`} className="card flex w-56 shrink-0 items-center gap-3 p-3 hover:shadow-lg">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-blush-100">{r.image ? <img src={r.image} alt="" className="h-full w-full object-cover" /> : null}</div>
                  <div className="min-w-0"><p className="truncate text-sm font-semibold">{r.name}</p><p className="truncate text-xs text-muted">{r.area}</p></div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="grid gap-4 rounded-3xl bg-white p-6 shadow-sm sm:grid-cols-[1fr_auto] sm:items-center sm:p-8">
          <div><h3 className="font-display text-2xl font-semibold">Own a salon or parlour?</h3><p className="mt-1 text-sm text-muted">List your business on Lushira to reach more customers. Free to register, approved by our team.</p></div>
          <Link to="/partner" className="btn btn-dark">Partner with Lushira</Link>
        </section>
      </div>
    </>
  )
}
