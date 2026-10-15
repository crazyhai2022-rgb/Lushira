import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { CartItem, ServiceMode } from '../lib/types'

export interface CartSalon { id: string; name: string; slug: string; homeService: boolean; logo: string | null }
interface CartState {
  salon: CartSalon | null
  items: CartItem[]
  mode: ServiceMode
  coupon: string
}
interface CartApi extends CartState {
  count: number
  subtotal: number
  totalMinutes: number
  /** returns false when the cart holds another salon's services and `force` is not set */
  add: (salon: CartSalon, item: Omit<CartItem, 'qty'>, force?: boolean) => boolean
  setQty: (id: string, qty: number) => void
  remove: (id: string) => void
  setMode: (m: ServiceMode) => void
  setCoupon: (c: string) => void
  clear: () => void
}

const KEY = 'lushira.cart.v1'
const empty: CartState = { salon: null, items: [], mode: 'salon', coupon: '' }
const Ctx = createContext<CartApi | null>(null)

function load(): CartState {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...empty, ...JSON.parse(raw) } : empty
  } catch {
    return empty
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CartState>(load)
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* storage unavailable */ }
  }, [state])

  const api = useMemo<CartApi>(() => {
    const subtotal = state.items.reduce((s, i) => s + i.price * i.qty, 0)
    const totalMinutes = state.items.reduce((s, i) => s + i.duration * i.qty, 0)
    return {
      ...state,
      count: state.items.reduce((s, i) => s + i.qty, 0),
      subtotal,
      totalMinutes,
      add(salon, item, force) {
        if (state.salon && state.salon.id !== salon.id && state.items.length && !force) return false
        setState((s) => {
          const base = s.salon && s.salon.id === salon.id ? s : { ...empty, coupon: '' }
          const found = base.items.find((i) => i.id === item.id)
          const items = found
            ? base.items.map((i) => (i.id === item.id ? { ...i, qty: Math.min(10, i.qty + 1) } : i))
            : [...base.items, { ...item, qty: 1 }]
          const mode: ServiceMode = base.mode === 'home' && !items.every((i) => i.atHome) ? 'salon' : base.mode
          return { ...base, salon, items, mode }
        })
        return true
      },
      setQty: (id, qty) =>
        setState((s) => {
          const items = qty <= 0 ? s.items.filter((i) => i.id !== id) : s.items.map((i) => (i.id === id ? { ...i, qty: Math.min(10, qty) } : i))
          return items.length ? { ...s, items } : empty
        }),
      remove: (id) =>
        setState((s) => {
          const items = s.items.filter((i) => i.id !== id)
          return items.length ? { ...s, items } : empty
        }),
      setMode: (mode) => setState((s) => ({ ...s, mode })),
      setCoupon: (coupon) => setState((s) => ({ ...s, coupon })),
      clear: () => setState(empty),
    }
  }, [state])

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export const useCart = () => {
  const v = useContext(Ctx)
  if (!v) throw new Error('useCart must be inside CartProvider')
  return v
}
