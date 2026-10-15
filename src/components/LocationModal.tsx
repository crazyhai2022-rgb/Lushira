import { useEffect, useState } from 'react'
import { LocateFixed, MapPin, Search, ShieldCheck } from 'lucide-react'
import { Modal, Spinner } from './ui'
import { usePlace } from '../context/LocationContext'
import { searchPlaces, type PlaceHit } from '../lib/geocode'
import { useSettings } from '../hooks/useSettings'

export default function LocationModal() {
  const loc = usePlace()
  const { radiusKm } = useSettings()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<PlaceHit[]>([])
  const [searching, setSearching] = useState(false)
  const [searchErr, setSearchErr] = useState<string | null>(null)

  useEffect(() => {
    if (q.trim().length < 3) { setHits([]); setSearchErr(null); return }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      setSearching(true); setSearchErr(null)
      try { setHits(await searchPlaces(q, ctrl.signal)) }
      catch (e) { if ((e as Error).name !== 'AbortError') setSearchErr('Search is unavailable right now. Please try again.') }
      finally { setSearching(false) }
    }, 450)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [q])

  return (
    <Modal open={loc.modalOpen} onClose={loc.closeModal} title="Find salons near you">
      <div className="space-y-4">
        <div className="flex gap-3 rounded-2xl bg-blush-100 p-3 text-sm text-plum-800">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-lush-600" />
          <p>
            Lushira uses your location only to show salons within <strong>{radiusKm} km</strong> of you, measured from the point you choose
            (your current position or the area you search). You can change it any time, and we never ask again if you say no.
          </p>
        </div>

        <button className="btn btn-primary w-full" onClick={() => void loc.useCurrentLocation()} disabled={loc.loading}>
          {loc.loading ? <Spinner className="h-4 w-4" /> : <LocateFixed className="h-4 w-4" />}
          {loc.loading ? 'Finding your location…' : 'Use My Current Location'}
        </button>
        {loc.error && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">{loc.error}</p>}

        <div className="flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />or search your area<span className="h-px flex-1 bg-line" /></div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Locality, area or pin code (e.g. B.B. Ganj)" aria-label="Search locality" />
          {searching && <Spinner className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-lush-600" />}
        </div>
        {searchErr && <p className="text-xs text-red-600">{searchErr}</p>}
        {hits.length > 0 && (
          <ul className="max-h-52 overflow-y-auto rounded-xl border border-line">
            {hits.map((h, i) => (
              <li key={i}>
                <button className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm hover:bg-blush-100"
                  onClick={() => { loc.setManual({ lat: h.lat, lng: h.lng, label: h.label.split(',').slice(0, 2).join(',').trim() }); setQ('') }}>
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-lush-600" /><span>{h.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {q.trim().length >= 3 && !searching && !searchErr && hits.length === 0 && <p className="text-xs text-muted">No places found. Try a nearby landmark or town name.</p>}

        <button className="btn btn-ghost w-full" onClick={loc.closeModal}>Not now</button>
      </div>
    </Modal>
  )
}
