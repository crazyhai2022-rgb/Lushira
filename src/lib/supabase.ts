import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(url && key)

// Only the public (publishable/anon) key is ever used in the browser.
export const supabase = createClient(url ?? 'http://localhost:54321', key ?? 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

export const env = {
  siteUrl: (import.meta.env.VITE_SITE_URL as string) || window.location.origin,
  mapboxToken: (import.meta.env.VITE_MAPBOX_TOKEN as string) || '',
  phoneOtpEnabled: import.meta.env.VITE_PHONE_OTP_ENABLED === 'true',
  razorpayKeyId: (import.meta.env.VITE_RAZORPAY_KEY_ID as string) || '',
  functionsUrl: url ? `${url}/functions/v1` : '',
}
export const razorpayEnabled = Boolean(env.razorpayKeyId)

export const BRAND = {
  name: 'Lushira',
  tagline: 'Beauty at your doorstep',
  email: 'Lushiraindia07@gmail.com',
  phone: '+91 9241383828',
  phoneRaw: '919241383828',
}

export function publicUrl(path: string | null | undefined) {
  if (!path) return null
  if (/^https?:\/\//.test(path) || path.startsWith('/')) return path
  return supabase.storage.from('salon-media').getPublicUrl(path).data.publicUrl
}
