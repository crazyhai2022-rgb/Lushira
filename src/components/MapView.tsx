import { useEffect } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents, Circle } from 'react-leaflet'
import L from 'leaflet'
import { Link } from 'react-router-dom'
import { env } from '../lib/supabase'

export interface MapMarker { id: string; lat: number; lng: number; label: string; sub?: string; href?: string; kind?: 'salon' | 'user' | 'provider' | 'home' }

const pin = (color: string, glyph: string) =>
  L.divIcon({
    className: '',
    iconSize: [34, 42],
    iconAnchor: [17, 40],
    popupAnchor: [0, -36],
    html: `<div style="width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};box-shadow:0 3px 8px rgba(60,15,41,.35);display:flex;align-items:center;justify-content:center;border:2px solid #fff"><span style="transform:rotate(45deg);color:#fff;font-size:15px;font-weight:700">${glyph}</span></div>`,
  })
const icons = { salon: pin('#c4416f', '✂'), user: pin('#3c0f29', '●'), provider: pin('#0f9d58', '➜'), home: pin('#3c0f29', '⌂') }

function Fit({ markers, center, zoom }: { markers: MapMarker[]; center: [number, number]; zoom: number }) {
  const map = useMap()
  useEffect(() => {
    if (markers.length > 1) {
      map.fitBounds(L.latLngBounds(markers.map((m) => [m.lat, m.lng] as [number, number])), { padding: [40, 40], maxZoom: 16 })
    } else map.setView(center, zoom)
  }, [map, markers, center, zoom])
  return null
}

function Tap({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) })
  return null
}

export default function MapView({ center, markers, zoom = 14, height = 320, radiusKm, className = '', onPick }: {
  center: [number, number]; markers: MapMarker[]; zoom?: number; height?: number | string; radiusKm?: number; className?: string; onPick?: (lat: number, lng: number) => void
}) {
  const tile = env.mapboxToken
    ? { url: `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/512/{z}/{x}/{y}@2x?access_token=${env.mapboxToken}`, attribution: '© Mapbox © OpenStreetMap', zoomOffset: -1, tileSize: 512 }
    : { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors', zoomOffset: 0, tileSize: 256 }
  return (
    <div className={className} style={{ height }}>
      <MapContainer center={center} zoom={zoom} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer url={tile.url} attribution={tile.attribution} zoomOffset={tile.zoomOffset} tileSize={tile.tileSize} />
        {onPick && <Tap onPick={onPick} />}
        <Fit markers={markers} center={center} zoom={zoom} />
        {radiusKm && <Circle center={center} radius={radiusKm * 1000} pathOptions={{ color: '#c4416f', weight: 1, fillOpacity: 0.05 }} />}
        {markers.map((m) => (
          <Marker key={m.id} position={[m.lat, m.lng]} icon={icons[m.kind ?? 'salon']}>
            <Popup>
              <strong>{m.label}</strong>
              {m.sub && <div className="text-xs">{m.sub}</div>}
              {m.href && <Link to={m.href} className="mt-1 block text-xs font-semibold text-lush-600">View salon →</Link>}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
