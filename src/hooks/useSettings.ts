import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface Settings { radiusKm: number; taxPercent: number; platformFee: number; cashEnabled: boolean; onlineEnabled: boolean; cancelHours: number; areaLabel: string; raw: Record<string, unknown> }

export function useSettings(): Settings {
  const { data } = useQuery({
    queryKey: ['settings'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const r = await supabase.from('app_settings').select('key,value')
      if (r.error) throw r.error
      return Object.fromEntries((r.data ?? []).map((x) => [x.key, x.value])) as Record<string, unknown>
    },
  })
  const s = data ?? {}
  return {
    radiusKm: Number(s.search_radius_km ?? 5),
    taxPercent: Number(s.tax_percent ?? 18),
    platformFee: Number(s.platform_fee_inr ?? 0),
    cashEnabled: s.cash_payments_enabled !== false,
    onlineEnabled: s.online_payments_enabled !== false,
    cancelHours: Number(s.cancellation_window_hours ?? 4),
    areaLabel: String(s.service_area_label ?? ''),
    raw: s,
  }
}
