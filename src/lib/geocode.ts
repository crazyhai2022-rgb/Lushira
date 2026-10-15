import { env } from './supabase'

export interface PlaceHit { lat: number; lng: number; label: string }

// Free OpenStreetMap geocoder by default; Mapbox when VITE_MAPBOX_TOKEN is configured.
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceHit[]> {
  const q = query.trim()
  if (q.length < 3) return []
  if (env.mapboxToken) {
    const r = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${env.mapboxToken}&country=in&limit=6`,
      { signal },
    )
    if (!r.ok) throw new Error('geocoder_failed')
    const j = await r.json()
    return (j.features ?? []).map((f: { center: [number, number]; place_name: string }) => ({ lat: f.center[1], lng: f.center[0], label: f.place_name }))
  }
  const r = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=in&limit=6&addressdetails=0&q=${encodeURIComponent(q)}`,
    { signal, headers: { 'Accept-Language': 'en' } },
  )
  if (!r.ok) throw new Error('geocoder_failed')
  const j = (await r.json()) as { lat: string; lon: string; display_name: string }[]
  return j.map((x) => ({ lat: Number(x.lat), lng: Number(x.lon), label: x.display_name }))
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    if (env.mapboxToken) {
      const r = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${env.mapboxToken}&limit=1`)
      const j = await r.json()
      return shorten(j.features?.[0]?.place_name)
    }
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&lat=${lat}&lon=${lng}`, { headers: { 'Accept-Language': 'en' } })
    if (!r.ok) return 'Current location'
    const j = (await r.json()) as { display_name?: string; address?: Record<string, string> }
    const a = j.address ?? {}
    const parts = [a.suburb || a.neighbourhood || a.village || a.hamlet, a.city || a.town || a.county || a.state_district].filter(Boolean)
    return parts.length ? parts.join(', ') : shorten(j.display_name)
  } catch {
    return 'Current location'
  }
}

const shorten = (s?: string) => (s ? s.split(',').slice(0, 2).join(',').trim() : 'Current location')
