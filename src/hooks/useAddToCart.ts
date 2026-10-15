import { useCart, type CartSalon } from '../context/CartContext'
import { useToast } from '../context/ToastContext'
import type { CartItem } from '../lib/types'

export function useAddToCart() {
  const cart = useCart()
  const toast = useToast()
  return (salon: CartSalon, item: Omit<CartItem, 'qty'>) => {
    if (cart.add(salon, item)) {
      toast.success(`${item.name} added to cart`)
      return true
    }
    if (window.confirm(`Your cart has services from ${cart.salon?.name}. Start a new cart with ${salon.name}?`)) {
      cart.add(salon, item, true)
      toast.success(`${item.name} added to cart`)
      return true
    }
    return false
  }
}
