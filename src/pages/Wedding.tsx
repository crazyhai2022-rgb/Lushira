import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Camera, CheckCircle2, Crown, Gem, Sparkles } from 'lucide-react'
import { searchServices } from '../lib/api'
import { ServiceCard } from '../components/cards'
import { CardSkeletonGrid, EmptyState, ErrorState, Field, PageHero } from '../components/ui'
import { useCart } from '../context/CartContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useAddToCart } from '../hooks/useAddToCart'
import { supabase, BRAND } from '../lib/supabase'
import { friendlyError } from '../lib/errors'
import { normalizePhone } from '../lib/format'

const HIGHLIGHTS = [
  { icon: Crown, t: 'Bridal makeup', d: 'HD, airbrush and traditional looks by experienced artists.' },
  { icon: Sparkles, t: 'Mehendi & hair', d: 'Hairstyling, draping and mehendi for the whole family.' },
  { icon: Gem, t: 'Pre-wedding care', d: 'Facials, spa, manicure and skin prep in the weeks before.' },
  { icon: Camera, t: 'Party & engagement', d: 'Looks for haldi, sangeet, engagement and reception.' },
]

export default function Wedding() {
  const cart = useCart()
  const add = useAddToCart()
  const { user, profile } = useAuth()
  const toast = useToast()
  const res = useQuery({ queryKey: ['wedding-services'], queryFn: async () => (await searchServices({ limit: 120 })).filter((s) => s.is_wedding) })
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ name: '', phone: '', date: '', venue: '', people: '1', msg: '' })
  const [err, setErr] = useState<Record<string, string>>({})

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const er: Record<string, string> = {}
    const name = f.name.trim() || profile?.full_name || ''
    const phone = normalizePhone(f.phone)
    if (name.length < 2) er.name = 'Enter your name'
    if (!phone) er.phone = 'Enter a valid mobile number'
    if (!f.date) er.date = 'Choose the event date'
    setErr(er)
    if (Object.keys(er).length) return
    setBusy(true)
    const r = await supabase.from('support_tickets').insert({
      user_id: user?.id ?? null, name, phone, email: user?.email ?? null,
      subject: 'Wedding quote request',
      message: `Event date: ${f.date}\nVenue/area: ${f.venue || '-'}\nPeople needing services: ${f.people}\nDetails: ${f.msg || '-'}`,
    })
    setBusy(false)
    if (r.error) return toast.error(friendlyError(r.error))
    setSent(true)
  }

  return (
    <>
      <PageHero eyebrow="Wedding special" title="Your big day, beautifully done" subtitle="Bridal and event beauty from salons and artists near you." image="/img/hero-bridal.jpg">
        <a href="#packages" className="btn btn-primary">See wedding services</a>
      </PageHero>
      <div className="container-x py-10">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {HIGHLIGHTS.map((h) => (
            <div key={h.t} className="card p-4 text-center">
              <h.icon className="mx-auto h-7 w-7 text-lush-600" /><h3 className="mt-2 font-display text-lg font-semibold">{h.t}</h3><p className="mt-1 text-xs text-muted">{h.d}</p>
            </div>
          ))}
        </div>

        <section id="packages" className="mt-12 scroll-mt-20">
          <h2 className="section-title">Wedding services &amp; packages</h2>
          <p className="mb-5 mt-1 text-sm text-muted">Listed by salons on Lushira. Pick a package and choose a date; for custom requirements request a quote below.</p>
          {res.isLoading ? <CardSkeletonGrid count={4} className="h-36" /> : res.isError ? <ErrorState onRetry={() => res.refetch()} /> :
            (res.data?.length ?? 0) === 0 ? (
              <EmptyState icon={<Crown className="h-6 w-6" />} title="No wedding packages listed yet" text="Salons are adding their bridal packages. You can still request a custom quote and our team will get back to you." action={<a href="#quote" className="btn btn-primary btn-sm">Request a quote</a>} />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {res.data!.map((s) => (
                  <ServiceCard key={s.id} s={s} inCart={cart.items.some((i) => i.id === s.id)}
                    onAdd={() => add({ id: s.salon_id, name: s.salon_name, slug: s.salon_slug, homeService: s.at_home, logo: s.salon_logo },
                      { id: s.id, name: s.name, price: Number(s.price_inr), duration: s.duration_min, atSalon: s.at_salon, atHome: s.at_home, image: s.image_url })} />
                ))}
              </div>
            )}
        </section>

        <section id="quote" className="mt-12 grid scroll-mt-20 gap-6 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <h2 className="section-title">Request a custom quote</h2>
            <p className="mt-2 text-sm text-muted">Tell us about your event — venue, date and how many people need services. Our team will contact you on the number you share. No payment is taken at this step.</p>
            <ul className="mt-4 space-y-2 text-sm">
              {['Trial sessions can be arranged with the salon', 'Event-day timings and travel are confirmed in advance', 'Advance and cancellation terms are shared before you book'].map((t) => (
                <li key={t} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-lush-600" />{t}</li>))}
            </ul>
            <p className="mt-4 text-sm text-muted">Prefer to talk? <a className="font-semibold text-lush-600" href={`tel:+${BRAND.phoneRaw}`}>{BRAND.phone}</a></p>
          </div>
          <div className="card p-5">
            {sent ? (
              <div className="py-8 text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-green-600" /><h3 className="mt-3 font-display text-2xl font-semibold">Request received</h3>
                <p className="mt-1 text-sm text-muted">Thank you! We will contact you soon to discuss your wedding plans.</p>
                <Link to="/services" className="btn btn-outline btn-sm mt-4">Continue browsing</Link></div>
            ) : (
              <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" noValidate>
                <Field label="Your name" required error={err.name}><input className="input" value={f.name || ''} placeholder={profile?.full_name || ''} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></Field>
                <Field label="Mobile number" required error={err.phone}><input className="input" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" placeholder="98765 43210" /></Field>
                <Field label="Event date" required error={err.date}><input className="input" type="date" min={new Date().toISOString().slice(0, 10)} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
                <Field label="People needing services"><input className="input" type="number" min={1} max={50} value={f.people} onChange={(e) => setF({ ...f, people: e.target.value })} /></Field>
                <div className="sm:col-span-2"><Field label="Venue / area"><input className="input" value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })} /></Field></div>
                <div className="sm:col-span-2"><Field label="Anything else?"><textarea className="input min-h-24" maxLength={800} value={f.msg} onChange={(e) => setF({ ...f, msg: e.target.value })} /></Field></div>
                <button className="btn btn-primary sm:col-span-2" disabled={busy}>{busy ? 'Sending…' : 'Request quote'}</button>
              </form>
            )}
          </div>
        </section>
      </div>
    </>
  )
}
