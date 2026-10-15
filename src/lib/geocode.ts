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

export interface AddressParts { line: string; landmark: string; area: string; city: string; state: string; pin: string }

/** Reverse-geocodes a point into editable address fields (street, area, city, state, PIN). Returns null on failure. */
export async function reverseGeocodeAddress(lat: number, lng: number): Promise<AddressParts | null> {
  try {
    if (env.mapboxToken) {
      const r = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${env.mapboxToken}&limit=1&country=in`)
      if (!r.ok) return null
      const f = (await r.json()).features?.[0] as { text?: string; address?: string; place_name?: string; context?: { id: string; text: string }[] } | undefined
      if (!f) return null
      const ctx = (p: string) => f.context?.find((c) => c.id.startsWith(p))?.text ?? ''
      return {
        line: [f.address, f.text].filter(Boolean).join(' ') || (f.place_name ?? '').split(',')[0],
        landmark: '', area: ctx('neighborhood') || ctx('locality'), city: ctx('place') || ctx('district'), state: ctx('region'),
        pin: /^\d{6}$/.test(ctx('postcode')) ? ctx('postcode') : '',
      }
    }
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&lat=${lat}&lon=${lng}`, { headers: { 'Accept-Language': 'en' } })
    if (!r.ok) return null
    const j = (await r.json()) as { display_name?: string; address?: Record<string, string> }
    const a = j.address ?? {}
    const area = a.suburb || a.neighbourhood || a.city_district || a.village || a.hamlet || ''
    const line = [a.house_number, a.road].filter(Boolean).join(' ') || a.neighbourhood || a.hamlet || a.village || (j.display_name ?? '').split(',').slice(0, 2).join(',').trim()
    const city = a.city || a.town || a.village || a.county || a.state_district || ''
    const pin = (a.postcode ?? '').replace(/\s/g, '')
    return { line, landmark: a.amenity || a.shop || '', area: area === city ? '' : area, city, state: a.state ?? '', pin: /^\d{6}$/.test(pin) ? pin : '' }
  } catch {
    return null
  }
}
