import { Link } from 'react-router-dom'
import { BadgeIndianRupee, CalendarCheck, ClipboardCheck, MapPinned, ShieldCheck, Smartphone, TrendingUp } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { BRAND } from '../../lib/supabase'

export default function PartnerLanding() {
  const { isPartner } = useAuth()
  const cta = isPartner ? { to: '/partner/dashboard', label: 'Open partner dashboard' } : { to: '/partner/register', label: 'Register your salon' }
  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-br from-blush-100 via-blush-50 to-blush-200">
        <img src="/img/partner-hero.jpg" alt="" className="pointer-events-none absolute inset-y-0 right-0 h-full w-full object-cover opacity-25 sm:w-1/2 sm:opacity-100 sm:[mask-image:linear-gradient(to_right,transparent,black_35%)]" />
        <div className="container-x relative py-14 sm:py-20">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-lush-600">Lushira partner</p>
          <h1 className="max-w-xl text-4xl font-semibold leading-tight sm:text-5xl">Grow your salon with Lushira</h1>
          <p className="mt-3 max-w-md text-muted">List your salon, parlour or at-home beauty service, get discovered by customers within 5 km and manage every booking in one place.</p>
          <div className="mt-6 flex flex-wrap gap-3"><Link to={cta.to} className="btn btn-primary">{cta.label}</Link><a href="#how" className="btn btn-outline">How it works</a></div>
        </div>
      </section>
      <div className="container-x py-12">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[[MapPinned, 'Local discovery', 'Show up when customers nearby search for the services you offer.'], [CalendarCheck, 'Smart bookings', 'Online slots, no double-booking, accept or decline requests in one tap.'], [BadgeIndianRupee, 'Flexible payments', 'Customers pay online or in cash — you see every payment status.'], [Smartphone, 'Mobile-first', 'Run your business from your phone with live notifications.'], [TrendingUp, 'Reports', 'Track bookings and revenue as you grow.'], [ShieldCheck, 'Verified & trusted', 'Every salon is reviewed before going live, building customer trust.']].map(([I, t, d]) => {
            const Icon = I as typeof MapPinned
            return <div key={t as string} className="card p-5"><Icon className="h-7 w-7 text-lush-600" /><h3 className="mt-2 font-display text-lg font-semibold">{t as string}</h3><p className="mt-1 text-sm text-muted">{d as string}</p></div>
          })}
        </div>
        <section id="how" className="mt-14 scroll-mt-20">
          <h2 className="section-title text-center">Register in 6 simple steps</h2>
          <ol className="mx-auto mt-6 grid max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {['Create your account', 'Salon information', 'Location on the map', 'Add your services', 'Hours, facilities & photos', 'Review & submit'].map((s, i) => (
              <li key={s} className="card flex items-center gap-3 p-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-lush-600 font-semibold text-white">{i + 1}</span><span className="font-medium">{s}</span></li>))}
          </ol>
          <p className="mt-4 flex items-center justify-center gap-2 text-sm text-muted"><ClipboardCheck className="h-4 w-4 text-lush-600" />Our team reviews every application, usually within 1–2 working days.</p>
        </section>
        <div className="mt-12 rounded-3xl bg-logo p-8 text-center text-white">
          <h2 className="font-display text-2xl font-semibold !text-white">Ready to get started?</h2>
          <p className="mt-1 text-sm text-white/70">Questions? Call {BRAND.phone} or write to {BRAND.email}</p>
          <Link to={cta.to} className="btn mt-4 bg-white text-plum-900 hover:bg-blush-100">{cta.label}</Link>
        </div>
      </div>
    </>
  )
}
