// Maps database / RPC error codes to friendly messages shown in the UI.
const MAP: Record<string, string> = {
  not_authenticated: 'Please log in to continue.',
  salon_unavailable: 'This salon is not available right now.',
  invalid_items: 'Some selected services are no longer available. Please review your cart.',
  invalid_phone: 'Please enter a valid mobile number.',
  invalid_name: 'Please enter your full name.',
  invalid_start: 'Please choose a date and time.',
  invalid_staff: 'The selected beautician is not available.',
  home_not_supported: 'This salon does not offer at-home service.',
  address_required: 'Please add your service address and location for at-home bookings.',
  service_not_available_at_home: 'One of the selected services is not available at home.',
  service_not_available_at_salon: 'One of the selected services is not available at the salon.',
  duration_too_long: 'Selected services are too long for a single appointment.',
  slot_unavailable: 'That time slot was just taken. Please pick another slot.',
  cash_disabled: 'Cash payment is currently unavailable.',
  online_disabled: 'Online payment is currently unavailable.',
  coupon_invalid: 'This coupon code is not valid.',
  coupon_not_started: 'This coupon is not active yet.',
  coupon_expired: 'This coupon has expired.',
  coupon_exhausted: 'This coupon has reached its usage limit.',
  coupon_not_applicable: 'This coupon is not valid for this salon.',
  coupon_min_order: 'Your order is below the minimum amount for this coupon.',
  coupon_already_used: 'You have already used this coupon.',
  cannot_cancel: 'This booking can no longer be cancelled.',
  not_found: 'We could not find that record.',
  forbidden: 'You do not have permission to do that.',
  invalid_state: 'This action is not allowed in the current state.',
  nothing_to_refund: 'There is no paid amount to refund.',
  refund_exists: 'A refund has already been requested for this booking.',
  already_submitted: 'This salon has already been submitted for review.',
  location_required: 'Please set your salon location on the map before submitting.',
  contact_required: 'Please add a contact number and address before submitting.',
  services_required: 'Please add at least one service before submitting.',
  hours_required: 'Please set your business hours before submitting.',
  invalid_coordinates: 'Those coordinates are not valid.',
  invalid_duration: 'Invalid service duration.',
}

export function friendlyError(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const msg = typeof e === 'string' ? e : (e as { message?: string })?.message ?? ''
  const key = Object.keys(MAP).find((k) => msg.includes(k))
  if (key) return MAP[key]
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Network problem. Please check your connection.'
  if (/row-level security|permission denied/i.test(msg)) return 'You do not have permission to do that.'
  if (/duplicate key/i.test(msg)) return 'That already exists.'
  if (/rate limit|too many/i.test(msg)) return 'Too many attempts. Please wait a bit and try again.'
  return msg && msg.length < 140 ? msg : fallback
}
