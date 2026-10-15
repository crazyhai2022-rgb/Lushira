import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, Navigate } from 'react-router-dom'
import { CalendarCheck, ChevronDown, Home, LayoutGrid, Mail, MapPin, Menu, Navigation, Phone, ShoppingBag, User, X } from 'lucide-react'
import { Logo, LogoMark, Spinner } from './ui'
import LocationModal from './LocationModal'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { usePlace } from '../context/LocationContext'
import { BRAND } from '../lib/supabase'

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/categories', label: 'Categories' },
  { to: '/wedding', label: 'Wedding' },
  { to: '/salons', label: 'Explore Salons' },
  { to: '/brands', label: 'Brands' },
]

function Header() {
  const { user, isAdmin, isPartner, signOut } = useAuth()
  const cart = useCart()
  const loc = usePlace()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => setOpen(false), [pathname])

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
      <div className="container-x flex h-16 items-center gap-3">
        <Link to="/" aria-label="Lushira home" className="shrink-0"><LogoMark /></Link>

        <nav className="ml-4 hidden items-center gap-6 lg:flex" aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => `text-sm font-medium transition hover:text-lush-600 ${isActive ? 'text-lush-600' : 'text-plum-800'}`}>
              {n.label}
            </NavLink>
          ))}
        </nav>

        <button onClick={loc.openModal} className="ml-auto flex min-w-0 max-w-[48%] items-center gap-1.5 rounded-full border border-blush-300 bg-blush-50 px-3 py-1.5 text-xs font-medium text-plum-800 hover:bg-blush-100 sm:max-w-[260px] sm:text-sm"
          aria-label="Change location">
          <MapPin className="h-4 w-4 shrink-0 text-lush-600" />
          <span className="truncate">{loc.loading ? 'Locating…' : loc.place?.label ?? 'Set location'}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        </button>

        <Link to="/cart" className="relative rounded-full p-2 text-plum-800 hover:bg-blush-100" aria-label={`Cart, ${cart.count} items`}>
          <ShoppingBag className="h-5 w-5" />
          {cart.count > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-lush-600 px-1 text-[10px] font-bold text-white">{cart.count}</span>}
        </Link>
        <Link to={user ? '/profile' : '/login'} className="hidden rounded-full bg-blush-200 p-2 text-lush-700 hover:bg-blush-300 sm:block" aria-label="Account"><User className="h-5 w-5" /></Link>
        <button className="rounded-full p-2 text-plum-800 hover:bg-blush-100 lg:hidden" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-plum-950/50 lg:hidden" onClick={() => setOpen(false)}>
          <aside className="animate-pop absolute right-0 top-0 h-full w-72 max-w-[85%] overflow-y-auto bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()} aria-label="Menu">
            <div className="mb-4 flex items-center justify-between"><LogoMark size="h-10 w-10" /><button aria-label="Close menu" onClick={() => setOpen(false)}><X className="h-5 w-5" /></button></div>
            <ul className="space-y-1 text-sm font-medium text-plum-800">
              {[...NAV, { to: '/services', label: 'All Services' }, { to: '/partner', label: 'Become a Partner' }, { to: '/help', label: 'Help & Support' }, { to: '/about', label: 'About Lushira' }].map((n) => (
                <li key={n.to}><Link to={n.to} className="block rounded-lg px-3 py-2.5 hover:bg-blush-100">{n.label}</Link></li>
              ))}
              {isPartner && <li><Link to="/partner/dashboard" className="block rounded-lg px-3 py-2.5 text-lush-700 hover:bg-blush-100">Partner dashboard</Link></li>}
              {isAdmin && <li><Link to="/admin" className="block rounded-lg px-3 py-2.5 text-lush-700 hover:bg-blush-100">Admin dashboard</Link></li>}
            </ul>
            <div className="mt-5 border-t border-line pt-4">
              {user ? (
                <div className="space-y-2">
                  <Link to="/profile" className="btn btn-outline w-full">My profile</Link>
                  <button className="btn btn-ghost w-full" onClick={() => void signOut()}>Log out</button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Link to="/login" className="btn btn-primary w-full">Log in</Link>
                  <Link to="/signup" className="btn btn-outline w-full">Create account</Link>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </header>
  )
}

function BottomNav() {
  const items = [
    { to: '/', label: 'Home', icon: Home, end: true },
    { to: '/categories', label: 'Categories', icon: LayoutGrid },
    { to: '/orders', label: 'Orders', icon: CalendarCheck },
    { to: '/track', label: 'Track', icon: Navigation },
    { to: '/profile', label: 'Profile', icon: User },
  ]
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className="grid grid-cols-5">
        {items.map((i) => (
          <li key={i.to}>
            <NavLink to={i.to} end={i.end} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? 'text-lush-600' : 'text-muted'}`}>
              <i.icon className="h-5 w-5" />{i.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function Footer() {
  const col = 'space-y-2 text-sm text-white/70'
  const h = 'mb-3 text-sm font-semibold text-white'
  return (
    <footer className="mt-16 bg-logo pb-24 text-white lg:pb-0">
      <div className="container-x grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <LogoMark size="h-14 w-14" light />
          <p className="mt-3 text-sm text-white/70">Salon, parlour and at-home beauty services — booked in minutes.</p>
        </div>
        <div>
          <h4 className={h}>Quick Links</h4>
          <ul className={col}>
            {[['/', 'Home'], ['/categories', 'Categories'], ['/services', 'Services'], ['/wedding', 'Wedding Special'], ['/salons', 'Explore Salons'], ['/brands', 'Brands'], ['/partner', 'Become a Partner']].map(([to, l]) => (
              <li key={to}><Link className="hover:text-white" to={to}>{l}</Link></li>))}
          </ul>
        </div>
        <div>
          <h4 className={h}>Help & Policies</h4>
          <ul className={col}>
            {[['/about', 'About Lushira'], ['/contact', 'Contact Us'], ['/faq', 'FAQ'], ['/help', 'Help & Support'], ['/privacy', 'Privacy Policy'], ['/terms', 'Terms & Conditions'], ['/refund-policy', 'Cancellation & Refund']].map(([to, l]) => (
              <li key={to}><Link className="hover:text-white" to={to}>{l}</Link></li>))}
          </ul>
        </div>
        <div>
          <h4 className={h}>Contact</h4>
          <ul className={col}>
            <li><a className="flex items-center gap-2 hover:text-white" href={`tel:+${BRAND.phoneRaw}`}><Phone className="h-4 w-4" />{BRAND.phone}</a></li>
            <li><a className="flex items-center gap-2 break-all hover:text-white" href={`mailto:${BRAND.email}`}><Mail className="h-4 w-4 shrink-0" />{BRAND.email}</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-white/50">© {new Date().getFullYear()} Lushira. All rights reserved.</div>
    </footer>
  )
}

export default function Layout() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo({ top: 0 }) }, [pathname])
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[200] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      <Header />
      <main id="main" className="flex-1 pb-20 lg:pb-0"><Outlet /></main>
      <Footer />
      <BottomNav />
      <LocationModal />
    </div>
  )
}

export function RequireAuth({ role, children }: { role?: 'admin' | 'partner'; children: React.ReactNode }) {
  const { user, loading, isAdmin, isPartner } = useAuth()
  const { pathname, search } = useLocation()
  if (loading) return <div className="flex h-[50vh] items-center justify-center text-lush-600"><Spinner className="h-8 w-8" /></div>
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(pathname + search)}`} replace />
  if (role === 'admin' && !isAdmin) return <Navigate to="/403" replace />
  if (role === 'partner' && !isPartner) return <Navigate to="/partner" replace />
  return <>{children}</>
}
