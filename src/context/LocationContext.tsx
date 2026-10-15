import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { reverseGeocode } from '../lib/geocode'

export interface Place { lat: number; lng: number; label: string; source: 'gps' | 'search' }
export type Consent = 'unknown' | 'granted' | 'denied' | 'unavailable'

interface LocState {
  place: Place | null
  consent: Consent
  loading: boolean
  error: string | null
  modalOpen: boolean
  openModal: () => void
  closeModal: () => void
  /** Asks the browser for the current position. Only ever called from an explicit button press. */
  useCurrentLocation: () => Promise<boolean>
  setManual: (p: { lat: number; lng: number; label: string }) => void
  clear: () => void
}

const PLACE_KEY = 'lushira.place.v1'
const SEEN_KEY = 'lushira.locPromptSeen.v1'
const Ctx = createContext<LocState | null>(null)

const readPlace = (): Place | null => {
  try {
    const raw = localStorage.getItem(PLACE_KEY)
    return raw ? (JSON.parse(raw) as Place) : null
  } catch { return null }
}

export function LocationProvider({ children }: { children: ReactNode }) {
  const [place, setPlace] = useState<Place | null>(readPlace)
  const [consent, setConsent] = useState<Consent>('unknown')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const persist = (p: Place | null) => {
    setPlace(p)
    try {
      if (p) localStorage.setItem(PLACE_KEY, JSON.stringify(p))
      else localStorage.removeItem(PLACE_KEY)
    } catch { /* ignore */ }
  }
  const markSeen = () => { try { localStorage.setItem(SEEN_KEY, '1') } catch { /* ignore */ } }

  const locate = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!('geolocation' in navigator)) {
        setConsent('unavailable')
        setError('Location is not supported on this device. Please search your area instead.')
        return resolve(false)
      }
      setLoading(true)
      setError(null)
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude: lat, longitude: lng } = pos.coords
          setConsent('granted')
          const label = await reverseGeocode(lat, lng)
          persist({ lat, lng, label, source: 'gps' })
          setLoading(false)
          resolve(true)
        },
        (err) => {
          setLoading(false)
          if (err.code === err.PERMISSION_DENIED) {
            setConsent('denied')
            setError('Location permission is blocked. You can search your area manually, or enable location for this site in your browser settings.')
          } else if (err.code === err.TIMEOUT) {
            setError('Finding your location took too long. Please try again or search your area.')
          } else {
            setConsent('unavailable')
            setError('Your location is unavailable right now. Please search your area instead.')
          }
          resolve(false)
        },
        { enableHighAccuracy: false, timeout: 12000, maximumAge: 5 * 60 * 1000 },
      )
    })
  }, [])

  // First visit: explain why we want location (never auto-request). If the user already granted it before, refresh silently.
  useEffect(() => {
    let cancelled = false
    const seen = (() => { try { return localStorage.getItem(SEEN_KEY) } catch { return '1' } })()
    const perms = (navigator as Navigator & { permissions?: Permissions }).permissions
    if (perms?.query) {
      perms.query({ name: 'geolocation' as PermissionName }).then((st) => {
        if (cancelled) return
        if (st.state === 'granted') { setConsent('granted'); void locate() }
        else if (st.state === 'denied') setConsent('denied')
        st.onchange = () => {
          setConsent(st.state === 'granted' ? 'granted' : st.state === 'denied' ? 'denied' : 'unknown')
        }
      }).catch(() => undefined)
    }
    if (!seen && !readPlace()) setModalOpen(true)
    return () => { cancelled = true }
  }, [locate])

  const value = useMemo<LocState>(() => ({
    place, consent, loading, error, modalOpen,
    openModal: () => setModalOpen(true),
    closeModal: () => { markSeen(); setModalOpen(false) },
    useCurrentLocation: async () => {
      const ok = await locate()
      if (ok) { markSeen(); setModalOpen(false) }
      return ok
    },
    setManual: (p) => { persist({ ...p, source: 'search' }); markSeen(); setError(null); setModalOpen(false) },
    clear: () => persist(null),
  }), [place, consent, loading, error, modalOpen, locate])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const usePlace = () => {
  const v = useContext(Ctx)
  if (!v) throw new Error('usePlace must be inside LocationProvider')
  return v
}
