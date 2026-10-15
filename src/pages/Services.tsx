import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { History, MapPin, Search, SlidersHorizontal, X } from 'lucide-react'
import { getCategories, searchServices, type ServiceSearch } from '../lib/api'
import { ServiceCard } from '../components/cards'
import { CardSkeletonGrid, EmptyState, ErrorState, PageHero } from '../components/ui'
import { usePlace } from '../context/LocationContext'
import { useCart } from '../context/CartContext'
import { useAddToCart } from '../hooks/useAddToCart'
import { addRecentSearch, clearRecentSearches, getRecentSearches } from '../lib/recent'

const SORTS = [
  { v: 'relevance', l: 'Relevance' },
  { v: 'distance', l: 'Distance' },
  { v: 'rating', l: 'Rating' },
  { v: 'price_asc', l: 'Price: low to high' },
  { v: 'price_desc', l: 'Price: high to low' },
] as const

export default function Services() {
  const [sp, setSp] = useSearchParams()
  const loc = usePlace()
  const cart = useCart()
  const addToCart = useAddToCart()
  const [showFilters, setShowFilters] = useState(false)
  const [text, setText] = useState(sp.get('q') ?? '')
  const [recent, setRecent] = useState<string[]>(getRecentSearches)

  const q = sp.get('q') ?? ''
  const category = sp.get('category')
  const sort = (sp.get('sort') as ServiceSearch['sort']) ?? 'relevance'
  const mode = (sp.get('mode') as 'salon' | 'home' | null) ?? null
  const maxPrice = sp.get('max') ? Number(sp.get('max')) : null
  const minRating = sp.get('rating') ? Number(sp.get('rating')) : null
  const near = sp.get('near') === '1' && !!loc.place
  const radius = Number(sp.get('radius') ?? 5)
  const salonFilter = sp.get('salon')

  useEffect(() => setText(q), [q])
  const set = (k: string, v: string | null) => {
    const n = new URLSearchParams(sp)
    if (v == null || v === '') n.delete(k); else n.set(k, v)
    setSp(n, { replace: true })
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    addRecentSearch(text); setRecent(getRecentSearches()); set('q', text.trim())
  }

  const cats = useQuery({ queryKey: ['categories'], queryFn: getCategories, staleTime: 10 * 60 * 1000 })
  const params: ServiceSearch = {
    query: q || null, category, mode, maxPrice, minRating, radiusKm: radius,
    lat: near || sort === 'distance' ? loc.place?.lat : null, lng: near || sort === 'distance' ? loc.place?.lng : null,
    sort: sort === 'distance' && !loc.place ? 'relevance' : sort, limit: 80,
  }
  const res = useQuery({ queryKey: ['services', params], queryFn: () => searchServices(params) })

  const salons = useMemo(() => {
    const m = new Map<string, string>()
    ;(res.data ?? []).forEach((s) => m.set(s.salon_id, s.salon_name))
    return [...m.entries()]
  }, [res.data])
  const rows = (res.data ?? []).filter((s) => !salonFilter || s.salon_id === salonFilter)
  const activeFilters = [mode, maxPrice, minRating, near, salonFilter].filter(Boolean).length

  return (
    <>
      <PageHero eyebrow="Book a service" title={category ? (cats.data?.find((c) => c.slug === category)?.name ?? 'Services') : 'All Services'} subtitle="Compare prices, ratings and distance across salons." />
      <div className="container-x py-6">
        <form onSubmit={submit} className="flex gap-2" role="search">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input className="input pl-10" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search services, salons or categories" aria-label="Search services" />
            {text && <button type="button" aria-label="Clear" onClick={() => { setText(''); set('q', null) }} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="h-4 w-4 text-muted" /></button>}
          </div>
          <button className="btn btn-primary">Search</button>
          <button type="button" className="btn btn-outline relative" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
            <SlidersHorizontal className="h-4 w-4" /><span className="hidden sm:inline">Filters</span>
            {activeFilters > 0 && <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-lush-600 text-[10px] text-white">{activeFilters}</span>}
          </button>
        </form>

        {!q && recent.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <History className="h-4 w-4 text-muted" />
            {recent.map((r) => <button key={r} onClick={() => set('q', r)} className="chip hover:bg-blush-200">{r}</button>)}
            <button className="text-muted underline" onClick={() => { clearRecentSearches(); setRecent([]) }}>Clear</button>
          </div>
        )}

        <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <button onClick={() => set('category', null)} className={`chip shrink-0 ${!category ? 'chip-active' : ''}`}>All</button>
          {(cats.data ?? []).map((c) => <button key={c.id} onClick={() => set('category', c.slug)} className={`chip shrink-0 ${category === c.slug ? 'chip-active' : ''}`}>{c.name}</button>)}
        </div>

        {showFilters && (
          <div className="card mt-4 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block"><span className="label">Sort by</span>
              <select className="input" value={sort} onChange={(e) => set('sort', e.target.value)}>
                {SORTS.map((s) => <option key={s.v} value={s.v} disabled={s.v === 'distance' && !loc.place}>{s.l}{s.v === 'distance' && !loc.place ? ' (set location)' : ''}</option>)}
              </select></label>
            <label className="block"><span className="label">Service type</span>
              <select className="input" value={mode ?? ''} onChange={(e) => set('mode', e.target.value)}>
                <option value="">Any</option><option value="salon">At the salon</option><option value="home">At home</option>
              </select></label>
            <label className="block"><span className="label">Max price</span>
              <select className="input" value={maxPrice ?? ''} onChange={(e) => set('max', e.target.value)}>
                <option value="">Any</option>{[500, 1000, 2000, 5000, 10000].map((p) => <option key={p} value={p}>Up to ₹{p.toLocaleString('en-IN')}</option>)}
              </select></label>
            <label className="block"><span className="label">Rating</span>
              <select className="input" value={minRating ?? ''} onChange={(e) => set('rating', e.target.value)}>
                <option value="">Any</option><option value="4.5">4.5 & up</option><option value="4">4.0 & up</option><option value="3">3.0 & up</option>
              </select></label>
            <label className="block"><span className="label">Salon</span>
              <select className="input" value={salonFilter ?? ''} onChange={(e) => set('salon', e.target.value)}>
                <option value="">All salons</option>{salons.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
              </select></label>
            <div className="sm:col-span-2">
              <span className="label">Distance</span>
              {loc.place ? (
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={near} onChange={(e) => set('near', e.target.checked ? '1' : null)} className="h-4 w-4 accent-lush-600" />Near {loc.place.label.split(',')[0]} only</label>
                  <select className="input !w-auto" value={radius} disabled={!near} onChange={(e) => set('radius', e.target.value)} aria-label="Radius">
                    {[2, 5, 10, 25].map((r) => <option key={r} value={r}>{r} km</option>)}
                  </select>
                </div>
              ) : <button type="button" className="btn btn-outline btn-sm" onClick={loc.openModal}><MapPin className="h-4 w-4" />Set location to filter by distance</button>}
            </div>
            <div className="flex items-end"><button className="btn btn-ghost btn-sm" onClick={() => setSp(new URLSearchParams(category ? { category } : {}), { replace: true })}>Reset filters</button></div>
          </div>
        )}

        <div className="mt-6">
          {res.isLoading ? <CardSkeletonGrid count={4} className="h-36" /> : res.isError ? <ErrorState message="We could not load services." onRetry={() => res.refetch()} /> :
            rows.length === 0 ? (
              <EmptyState icon={<Search className="h-6 w-6" />} title="No services found"
                text={q ? `Nothing matched “${q}”. Try a different word, remove a filter, or browse a category.` : 'No services match these filters yet. Salons are being onboarded — please check back soon.'}
                action={<div className="flex flex-wrap justify-center gap-2">
                  <button className="btn btn-outline btn-sm" onClick={() => setSp(new URLSearchParams(), { replace: true })}>Clear all filters</button>
                  <Link to="/categories" className="btn btn-primary btn-sm">Browse categories</Link></div>} />
            ) : (
              <>
                <p className="mb-3 text-sm text-muted">{rows.length} service{rows.length > 1 ? 's' : ''} found</p>
                <div className="grid gap-4 lg:grid-cols-2">
                  {rows.map((s) => (
                    <ServiceCard key={s.id} s={s} inCart={cart.items.some((i) => i.id === s.id)}
                      onAdd={() => addToCart({ id: s.salon_id, name: s.salon_name, slug: s.salon_slug, homeService: s.at_home, logo: s.salon_logo },
                        { id: s.id, name: s.name, price: Number(s.price_inr), duration: s.duration_min, atSalon: s.at_salon, atHome: s.at_home, image: s.image_url })} />
                  ))}
                </div>
              </>
            )}
        </div>
      </div>
    </>
  )
}
