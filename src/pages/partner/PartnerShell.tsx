import { useEffect } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { LogOut, Phone } from 'lucide-react'
import { LogoMark } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { BRAND } from '../../lib/supabase'

/** Standalone layout for partners: no customer navigation, cart, or footer links. */
export default function PartnerShell() {
  const { user, signOut } = useAuth()
  const nav = useNavigate()
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo({ top: 0 }) }, [pathname])
  return (
    <div className="flex min-h-screen flex-col bg-blush-50">
      <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
        <div className="container-x flex h-16 items-center justify-between gap-3">
          <Link to={user ? '/partner/dashboard' : '/partner'} aria-label="Lushira partner home" className="flex items-center gap-3">
            <LogoMark />
            <span className="hidden rounded-full bg-blush-200 px-3 py-1 text-xs font-semibold text-lush-700 sm:inline">Partner portal</span>
          </Link>
          <div className="flex items-center gap-2">
            <a href={`tel:+${BRAND.phoneRaw}`} className="btn btn-ghost btn-sm" aria-label="Call Lushira support"><Phone className="h-4 w-4" /><span className="hidden sm:inline">Support</span></a>
            {user
              ? <button className="btn btn-outline btn-sm" onClick={async () => { await signOut(); nav('/partner/login') }}><LogOut className="h-4 w-4" />Log out</button>
              : <Link to="/partner/login" className="btn btn-outline btn-sm">Partner login</Link>}
          </div>
        </div>
      </header>
      <main className="flex-1"><Outlet /></main>
      <footer className="border-t border-line py-4 text-center text-xs text-muted">© {new Date().getFullYear()} Lushira Partner · {BRAND.email}</footer>
    </div>
  )
}
