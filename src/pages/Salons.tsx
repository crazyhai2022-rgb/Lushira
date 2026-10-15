import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { List, LocateFixed, Map as MapIcon, MapPin, Search, Store } from 'lucide-react'
import { getCategories, getNearbySalons, getSalonList } from '../lib/api'
import { SalonCard } from '../components/cards'
import MapView, { type MapMarker } from '../components/MapView'
import { CardSkeletonGrid, EmptyState, ErrorState, PageHero } from '../components/ui'
import { usePlace } from '../context/LocationContext'
import { useSettings } from '../hooks/useSettings'
import { distance } from '../lib/format'

export default function Salons() {
  const loc = usePlace()
  const settings = useSettings()
  const [view, setView] = useState<'list' | 'map'>('list')
  const [radius, setRadius] = useState<number | null>(null)
  const [category, setCategory] = useState('')
  const homeOnly = true
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const place = loc.place
  const r = radius ?? settings.radiusKm

  const cats = useQuery({ queryKey: ['categories'], queryFn: getCategories, staleTime: 10 * 60 * 1000 })
  const res = useQuery({
    queryKey: ['salons', place?.lat, place?.lng, r, category, homeOnly, debounced],
    queryFn: async () => {
      if (place) return getNearbySalons({ lat: place.lat, lng: place.lng, radiusKm: r, category: category || null, query: debounced || null, homeOnly })
      const all = await getSalonList({ query: debounced || undefined, limit: 60 })
      return homeOnly ? all.filter((s) => s.home_service) : all
    },
  })

  const markers: MapMarker[] = useMemo(() => {
    const m: MapMarker[] = (res.data ?? []).filter((s) => s.lat != null && s.lng != null).map((s) => ({
      id: s.id, lat: s.lat!, lng: s.lng!, label: s.name, sub: `${s.distance_m != null ? distance(s.distance_m) + ' · ' : ''}${s.area ?? ''}`, href: `/salon/${s.slug}`,
    }))
    if (place) m.push({ id: 'me', lat: place.lat, lng: place.lng, label: 'You are here', sub: place.label, kind: 'user' })
    return m
  }, [res.data, place])

  const center: [number, number] = place ? [place.lat, place.lng] : markers[0] ? [markers[0].lat, markers[0].lng] : [25.5941, 85.1376]

  return (
    <>
      <PageHero eyebrow="Explore" title="Salons & Parlours" subtitle={place ? `Showing salons within ${r} km of ${place.label.split(',')[0]}.` : 'Set your location to see salons nearby.'} />
      <div className="container-x py-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input className="input pl-10" placeholder="Search salons or services" aria-label="Search salons" value={query}
              onChange={(e) => { setQuery(e.target.value); clearTimeout((window as unknown as { __t?: number }).__t); (window as unknown as { __t?: number }).__t = window.setTimeout(() => setDebounced(e.target.value.trim()), 400) }} />
          </div>
          <select className="input !w-auto" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" disabled={!place}>
            <option value="">All categories</option>{(cats.data ?? []).map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
          </select>
          <select className="input !w-auto" value={r} onChange={(e) => setRadius(Number(e.target.value))} aria-label="Radius" disabled={!place}>
            {[...new Set([2, 5, 10, 25, settings.radiusKm])].sort((a, b) => a - b).map((k) => <option key={k} value={k}>{k} km</option>)}
          </select>
          <div className="inline-flex rounded-full bg-blush-100 p-1" role="tablist" aria-label="View">
            <button role="tab" aria-selected={view === 'list'} onClick={() => setView('list')} className={`btn btn-sm ${view === 'list' ? 'btn-primary' : 'btn-ghost'}`}><List className="h-4 w-4" />List</button>
            <button role="tab" aria-selected={view === 'map'} onClick={() => setView('map')} className={`btn btn-sm ${view === 'map' ? 'btn-primary' : 'btn-ghost'}`}><MapIcon className="h-4 w-4" />Map</button>
          </div>
        </div>

        {!place && (
          <div className="card mt-4 flex flex-wrap items-center gap-3 bg-blush-100 p-4 text-sm">
            <MapPin className="h-5 w-5 text-lush-600" /><span className="flex-1">Showing all salons. Share your location to see only those within {settings.radiusKm} km, with distances.</span>
            <button className="btn btn-primary btn-sm" onClick={() => void loc.useCurrentLocation()}><LocateFixed className="h-4 w-4" />Use My Current Location</button>
            <button className="btn btn-outline btn-sm" onClick={loc.openModal}>Search area</button>
          </div>
        )}

        <div className="mt-6">
          {res.isLoading ? <CardSkeletonGrid count={6} /> : res.isError ? <ErrorState message="We could not load salons." onRetry={() => res.refetch()} /> :
            (res.data?.length ?? 0) === 0 ? (
              <EmptyState icon={<Store className="h-6 w-6" />} title={place ? `No salons within ${r} km` : 'No salons listed yet'}
                text={place ? 'Try a bigger radius, remove filters or search another area. Salons are added as owners register and get approved.' : 'Salons appear here once partners register and are approved.'}
                action={<div className="flex flex-wrap justify-center gap-2">
                  {place && r < 25 && <button className="btn btn-outline btn-sm" onClick={() => setRadius(25)}>Search within 25 km</button>}
                  {place && <button className="btn btn-outline btn-sm" onClick={loc.openModal}>Change location</button>}
                  <Link to="/partner" className="btn btn-primary btn-sm">Register your salon</Link></div>} />
            ) : view === 'list' ? (
              <>
                <p className="mb-3 text-sm text-muted">{res.data!.length} salon{res.data!.length > 1 ? 's' : ''}{place ? ` within ${r} km` : ''}</p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{res.data!.map((s) => <SalonCard key={s.id} s={s} />)}</div>
              </>
            ) : (
              <MapView center={center} markers={markers} height="60vh" radiusKm={place ? r : undefined} zoom={13} />
            )}
        </div>
      </div>
    </>
  )
}
