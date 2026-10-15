import { supabase } from './supabase'
import type { Banner, Booking, Brand, Category, Salon, SalonLite, ServiceHit } from './types'

const ok = <T,>(r: { data: T | null; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message)
  return r.data as T
}

export const categoryImage = (slug: string | null | undefined) => (slug ? `/img/cat-${slug}.jpg` : '/img/hero-beauty.jpg')

export async function getCategories(): Promise<Category[]> {
  return ok(await supabase.from('service_categories').select('*').eq('is_active', true).order('sort_order'))
}

export async function getBanners(): Promise<Banner[]> {
  return ok(await supabase.from('banners').select('id,title,subtitle,image_url,link_url').order('sort_order'))
}

export interface NearbyParams {
  lat: number
  lng: number
  radiusKm?: number | null
  category?: string | null
  query?: string | null
  homeOnly?: boolean
  limit?: number
}
export async function getNearbySalons(p: NearbyParams): Promise<SalonLite[]> {
  const rows = ok(
    await supabase.rpc('nearby_salons', {
      p_lat: p.lat,
      p_lng: p.lng,
      p_radius_km: p.radiusKm ?? null,
      p_category_slug: p.category ?? null,
      p_query: p.query ?? null,
      p_home_only: p.homeOnly ?? false,
      p_limit: p.limit ?? 50,
    }),
  ) as SalonLite[]
  if (!rows.length) return rows
  // blue-tick flag (kept out of the RPC so its signature stays stable)
  const v = await supabase.from('salons').select('id,verified').in('id', rows.map((r) => r.id))
  const flags = new Map((v.data ?? []).map((x) => [x.id as string, !!x.verified]))
  return rows.map((r) => ({ ...r, verified: flags.get(r.id) ?? false }))
}

const SALON_LITE_COLS = 'id,name,slug,logo_url,cover_url,area,city,address_line,rating_avg,rating_count,home_service,featured,verified,lat,lng'
export async function getSalonList(opts: { featured?: boolean; limit?: number; query?: string } = {}): Promise<SalonLite[]> {
  let q = supabase.from('salons').select(SALON_LITE_COLS + ',salon_services(price_inr)').eq('status', 'approved')
  if (opts.featured) q = q.eq('featured', true)
  if (opts.query) q = q.ilike('name', `%${opts.query.replace(/[%_]/g, '')}%`)
  const rows = ok(await q.order('featured', { ascending: false }).order('rating_avg', { ascending: false }).limit(opts.limit ?? 24)) as unknown as (SalonLite & { salon_services: { price_inr: number }[] })[]
  return rows.map((r) => ({
    ...r,
    min_price: r.salon_services?.length ? Math.min(...r.salon_services.map((s) => Number(s.price_inr))) : null,
    distance_m: null,
  }))
}

export interface ServiceSearch {
  query?: string | null
  category?: string | null
  lat?: number | null
  lng?: number | null
  radiusKm?: number | null
  maxPrice?: number | null
  mode?: 'salon' | 'home' | null
  minRating?: number | null
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'rating' | 'distance'
  limit?: number
}
export async function searchServices(p: ServiceSearch): Promise<ServiceHit[]> {
  return ok(
    await supabase.rpc('search_services', {
      p_query: p.query ?? null,
      p_category_slug: p.category ?? null,
      p_lat: p.lat ?? null,
      p_lng: p.lng ?? null,
      p_radius_km: p.radiusKm ?? null,
      p_max_price: p.maxPrice ?? null,
      p_mode: p.mode ?? null,
      p_min_rating: p.minRating ?? null,
      p_sort: p.sort ?? 'relevance',
      p_limit: p.limit ?? 60,
    }),
  ) as ServiceHit[]
}

export async function getBrands(): Promise<Brand[]> {
  return ok(await supabase.from('brands').select('id,name,slug,logo_url,description,brand_services(id,name,price_inr,description)').eq('is_active', true).order('name'))
}

export async function getSalonBySlug(slug: string): Promise<Salon | null> {
  const r = await supabase
    .from('salons')
    .select('*,salon_images(id,url,kind,sort_order),salon_business_hours(*),salon_staff(id,name,role_title,photo_url),salon_services(*,service_categories(name,slug))')
    .eq('slug', slug)
    .eq('status', 'approved')
    .maybeSingle()
  if (r.error) throw new Error(r.error.message)
  if (!r.data) return null
  const s = r.data as unknown as Salon
  s.salon_services = (s.salon_services ?? []).filter((x) => x.is_active).sort((a, b) => a.name.localeCompare(b.name))
  s.salon_business_hours = (s.salon_business_hours ?? []).sort((a, b) => a.weekday - b.weekday)
  return s
}

export async function getSalonBrandServices(salonId: string) {
  const r = await supabase
    .from('salon_brand_services')
    .select('id,brand_services(id,name,price_inr,brands(id,name,logo_url))')
    .eq('salon_id', salonId)
    .eq('verified', true)
  if (r.error) throw new Error(r.error.message)
  return (r.data ?? []) as unknown as { id: string; brand_services: { id: string; name: string; price_inr: number | null; brands: { id: string; name: string; logo_url: string | null } } }[]
}

export async function getSalonReviews(salonId: string) {
  const r = await supabase.from('reviews').select('id,rating,comment,created_at').eq('salon_id', salonId).order('created_at', { ascending: false }).limit(20)
  if (r.error) throw new Error(r.error.message)
  return (r.data ?? []) as { id: string; rating: number; comment: string | null; created_at: string }[]
}

export async function getServiceById(id: string) {
  const r = await supabase
    .from('salon_services')
    .select('*,service_categories(name,slug),salons!inner(id,name,slug,logo_url,area,city,address_line,rating_avg,rating_count,home_service,contact_phone,cancellation_policy,lat,lng,status)')
    .eq('id', id)
    .eq('is_active', true)
    .maybeSingle()
  if (r.error) throw new Error(r.error.message)
  return r.data as unknown as (import('./types').SalonService & { salons: Salon }) | null
}

export async function getSlots(salonId: string, date: string, durationMin: number, staffId: string | null, bufferMin: number) {
  const r = await supabase.rpc('get_available_slots', {
    p_salon_id: salonId, p_date: date, p_duration_min: durationMin, p_staff_id: staffId, p_buffer_min: bufferMin,
  })
  return ok(r) as { slot_start: string; slot_end: string }[]
}

export const BOOKING_SELECT =
  '*,salons(name,slug,logo_url,contact_phone,area,city,address_line,lat,lng,cancellation_policy),booking_items(id,name,price_inr,duration_min,quantity,salon_service_id),reviews(id,rating)'

export async function getMyBookings(): Promise<Booking[]> {
  return ok(await supabase.from('bookings').select(BOOKING_SELECT).order('scheduled_start', { ascending: false }).limit(100)) as unknown as Booking[]
}
export async function getBooking(id: string): Promise<Booking | null> {
  const r = await supabase.from('bookings').select(BOOKING_SELECT).eq('id', id).maybeSingle()
  if (r.error) throw new Error(r.error.message)
  return r.data as unknown as Booking | null
}
