export type SalonStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'suspended'
export type ServiceMode = 'salon' | 'home'
export type BookingStatus =
  | 'pending' | 'confirmed' | 'provider_assigned' | 'on_the_way' | 'in_progress'
  | 'completed' | 'cancelled' | 'rejected' | 'no_show'
export type PaymentMethod = 'razorpay' | 'cash'
export type AppRole = 'customer' | 'partner' | 'admin'

export interface Category {
  id: string
  name: string
  slug: string
  description: string | null
  image_url: string | null
  sort_order: number
  is_active: boolean
}

export interface SalonLite {
  id: string
  name: string
  slug: string
  logo_url: string | null
  cover_url: string | null
  area: string | null
  city: string | null
  address_line: string | null
  rating_avg: number
  rating_count: number
  home_service: boolean
  featured: boolean
  verified?: boolean
  min_price: number | null
  distance_m: number | null
  lat: number | null
  lng: number | null
}

export interface SalonService {
  id: string
  salon_id: string
  category_id: string | null
  name: string
  description: string | null
  price_inr: number
  duration_min: number
  buffer_min: number
  at_salon: boolean
  at_home: boolean
  image_url: string | null
  is_wedding: boolean
  is_active: boolean
  service_categories?: { name: string; slug: string } | null
}

export interface HoursRow { id: string; weekday: number; opens: string | null; closes: string | null; is_closed: boolean }
export interface StaffRow { id: string; name: string; role_title: string | null; photo_url: string | null }

export interface Salon {
  id: string
  owner_id: string
  name: string
  slug: string
  business_type: string | null
  description: string | null
  contact_phone: string | null
  contact_email: string | null
  logo_url: string | null
  cover_url: string | null
  country: string
  state: string | null
  city: string | null
  area: string | null
  address_line: string | null
  landmark: string | null
  pin_code: string | null
  status: SalonStatus
  rejection_reason: string | null
  featured: boolean
  verified?: boolean
  is_brand?: boolean
  brand_name?: string | null
  brand_logo_url?: string | null
  brand_verified?: boolean
  home_service: boolean
  appointment_required: boolean
  walk_in: boolean
  facilities: Record<string, boolean>
  concurrent_capacity: number
  cancellation_policy: string | null
  rating_avg: number
  rating_count: number
  lat: number | null
  lng: number | null
  salon_images?: { id: string; url: string; kind: string; sort_order: number }[]
  salon_business_hours?: HoursRow[]
  salon_staff?: StaffRow[]
  salon_services?: SalonService[]
}

export interface ServiceHit {
  id: string
  name: string
  description: string | null
  price_inr: number
  duration_min: number
  image_url: string | null
  at_salon: boolean
  at_home: boolean
  is_wedding: boolean
  category_slug: string | null
  category_name: string | null
  salon_id: string
  salon_name: string
  salon_slug: string
  salon_logo: string | null
  rating_avg: number
  rating_count: number
  distance_m: number | null
}

export interface Banner { id: string; title: string; subtitle: string | null; image_url: string | null; link_url: string | null }

export interface Brand {
  id: string
  name: string
  slug: string
  logo_url: string | null
  description: string | null
  brand_services?: { id: string; name: string; price_inr: number | null; description: string | null }[]
}

export interface Booking {
  id: string
  reference: string
  customer_id: string
  salon_id: string
  staff_id: string | null
  mode: ServiceMode
  scheduled_start: string
  scheduled_end: string
  status: BookingStatus
  customer_name: string
  customer_phone: string
  customer_email: string | null
  notes: string | null
  address: { line1?: string; landmark?: string; area?: string; city?: string; pin_code?: string; lat?: number; lng?: number } | null
  subtotal_inr: number
  discount_inr: number
  tax_inr: number
  fee_inr: number
  total_inr: number
  payment_method: PaymentMethod
  payment_status: string
  cancel_reason: string | null
  created_at: string
  salons?: { name: string; slug: string; logo_url: string | null; contact_phone: string | null; area: string | null; city: string | null; address_line: string | null; lat: number | null; lng: number | null; cancellation_policy: string | null } | null
  booking_items?: { id: string; name: string; price_inr: number; duration_min: number; quantity: number; salon_service_id: string | null }[]
  reviews?: { id: string; rating: number }[] | null
}

export interface Profile {
  id: string
  full_name: string
  phone: string | null
  phone_verified: boolean
  email: string | null
  avatar_url: string | null
  marketing_opt_in: boolean
  location_consent: boolean
  deletion_requested_at: string | null
}

export interface CartItem {
  id: string // salon_service_id
  name: string
  price: number
  duration: number
  qty: number
  atSalon: boolean
  atHome: boolean
  image: string | null
}
