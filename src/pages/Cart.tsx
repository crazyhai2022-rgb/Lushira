import { Link, useNavigate } from 'react-router-dom'
import { Clock, Home, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react'
import { useCart } from '../context/CartContext'
import { useSettings } from '../hooks/useSettings'
import { EmptyState } from '../components/ui'
import { duration, inr } from '../lib/format'
import { publicUrl } from '../lib/supabase'
import { categoryImage } from '../lib/api'

export default function Cart() {
  const cart = useCart()
  const nav = useNavigate()
  const st = useSettings()
  if (!cart.items.length || !cart.salon) {
    return <div className="container-x py-12"><EmptyState icon={<ShoppingBag className="h-6 w-6" />} title="Your cart is empty" text="Add services from a salon to get started." action={<Link to="/services" className="btn btn-primary btn-sm">Browse services</Link>} /></div>
  }
  return (
    <div className="container-x py-8">
      <h1 className="text-3xl font-semibold">Your cart</h1>
      <Link to={`/salon/${cart.salon.slug}`} className="mt-1 inline-block text-sm text-lush-600 hover:underline">{cart.salon.name}</Link>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          {cart.items.map((i) => (
            <div key={i.id} className="card flex gap-3 p-3">
              <img src={publicUrl(i.image) ?? categoryImage(null)} alt="" className="h-20 w-20 rounded-xl object-cover" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{i.name}</p>
                <p className="flex items-center gap-1 text-xs text-muted"><Clock className="h-3.5 w-3.5" />{duration(i.duration)}</p>
                <p className="mt-1 font-semibold text-lush-600">{inr(i.price)}</p>
              </div>
              <div className="flex flex-col items-end justify-between">
                <button aria-label={`Remove ${i.name}`} onClick={() => cart.remove(i.id)} className="text-muted hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                <div className="flex items-center gap-2 rounded-full bg-blush-100 px-1">
                  <button aria-label="Decrease" className="p-1.5" onClick={() => cart.setQty(i.id, i.qty - 1)}><Minus className="h-3.5 w-3.5" /></button>
                  <span className="w-5 text-center text-sm font-semibold" aria-live="polite">{i.qty}</span>
                  <button aria-label="Increase" className="p-1.5" onClick={() => cart.setQty(i.id, i.qty + 1)} disabled={i.qty >= 10}><Plus className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            </div>))}
          <div className="card flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blush-100 text-lush-600"><Home className="h-5 w-5" /></span>
            <div><p className="font-semibold">Service at your home</p><p className="text-xs text-muted">The beautician comes to your address. You choose the date, time and location at checkout.</p></div>
          </div>
        </div>
        <aside className="card h-fit p-5 lg:sticky lg:top-24">
          <h2 className="font-display text-xl font-semibold">Summary</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{inr(cart.subtotal)}</dd></div>
            {st.platformFee > 0 && <div className="flex justify-between text-muted"><dt>Platform fee</dt><dd>{inr(st.platformFee)}</dd></div>}
            <div className="flex justify-between border-t border-line pt-2 text-base font-semibold"><dt>Estimated total</dt><dd>{inr(cart.subtotal + st.platformFee)}</dd></div>
          </dl>
          <p className="mt-1 text-xs text-muted">Coupons are applied at checkout. Final price is confirmed by our server.</p>
          <button className="btn btn-primary mt-4 w-full" onClick={() => nav('/checkout')}>Choose date &amp; time</button>
          <button className="btn btn-ghost mt-2 w-full text-xs" onClick={() => { if (window.confirm('Remove everything from your cart?')) cart.clear() }}>Clear cart</button>
        </aside>
      </div>
    </div>
  )
}
