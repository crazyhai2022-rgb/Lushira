import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, Clock, Heart, Mail, MapPin, Phone, ShieldCheck, Sparkles } from 'lucide-react'
import { PageHero, Field, EmptyState } from '../components/ui'
import { BRAND, supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useSettings } from '../hooks/useSettings'
import { friendlyError } from '../lib/errors'
import { isEmail, normalizePhone } from '../lib/format'

const Doc = ({ title, updated, children }: { title: string; updated?: string; children: ReactNode }) => (
  <>
    <PageHero eyebrow="Lushira" title={title} subtitle={updated ? `Last updated: ${updated}` : undefined} />
    <article className="container-x max-w-3xl space-y-4 py-8 text-[15px] leading-relaxed [&_h2]:mt-6 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_a]:font-medium [&_a]:text-lush-600 [&_a]:underline">{children}</article>
  </>
)
const Mail_ = () => <a href={`mailto:${BRAND.email}`}>{BRAND.email}</a>

export function About() {
  return (
    <>
      <PageHero eyebrow="About us" title="Beauty at your doorstep" subtitle="Lushira connects you with trusted salons, parlours and at-home beauty experts near you." image="/img/hero-beauty.jpg" />
      <div className="container-x max-w-3xl space-y-5 py-10">
        <p>Lushira is a beauty marketplace. You discover salons and beauticians around you, compare services and prices, pick a time that suits you and book — at the salon or in the comfort of your home.</p>
        <p>We work with independent salon owners and beauty professionals who list their own services, prices and availability. Every salon is reviewed by our team before it appears on Lushira.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {[[Sparkles, 'Look good', 'Services across skin, hair, makeup, nails, wellness and bridal.'], [ShieldCheck, 'Feel safe', 'Reviewed partners, transparent prices and secure payments.'], [Heart, 'Be you', 'Choose what you want, where you want it, when you want it.']].map(([I, t, d]) => {
            const Icon = I as typeof Sparkles
            return <div key={t as string} className="card p-4 text-center"><Icon className="mx-auto h-7 w-7 text-lush-600" /><h3 className="mt-2 font-display text-lg font-semibold">{t as string}</h3><p className="text-sm text-muted">{d as string}</p></div>
          })}
        </div>
        <p>Are you a salon owner or freelance beautician? <Link to="/partner" className="font-semibold text-lush-600 underline">Join Lushira as a partner</Link> and reach more customers in your area.</p>
      </div>
    </>
  )
}

export function Contact() {
  const { user, profile } = useAuth()
  const toast = useToast()
  const [f, setF] = useState({ name: profile?.full_name ?? '', email: user?.email ?? '', phone: '', subject: '', message: '' })
  const [err, setErr] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const er: Record<string, string> = {}
    if (f.name.trim().length < 2) er.name = 'Enter your name'
    if (f.email && !isEmail(f.email)) er.email = 'Enter a valid email'
    if (!f.email && !normalizePhone(f.phone)) er.email = 'Provide an email or a valid phone so we can reply'
    if (f.subject.trim().length < 3) er.subject = 'Add a subject'
    if (f.message.trim().length < 5) er.message = 'Tell us a little more'
    setErr(er)
    if (Object.keys(er).length) return
    setBusy(true)
    const r = await supabase.from('support_tickets').insert({ user_id: user?.id ?? null, name: f.name.trim(), email: f.email.trim() || null, phone: normalizePhone(f.phone), subject: f.subject.trim(), message: f.message.trim() })
    setBusy(false)
    if (r.error) return toast.error(friendlyError(r.error))
    setDone(true)
  }
  return (
    <>
      <PageHero eyebrow="Get in touch" title="Contact us" subtitle="Questions about a booking, your salon listing or anything else — we are here to help." />
      <div className="container-x grid gap-6 py-8 md:grid-cols-[1fr_1.3fr]">
        <div className="space-y-3">
          {[[Phone, 'Call us', BRAND.phone, `tel:+${BRAND.phoneRaw}`], [Mail, 'Email us', BRAND.email, `mailto:${BRAND.email}`]].map(([I, t, v, h]) => {
            const Icon = I as typeof Phone
            return <a key={t as string} href={h as string} className="card flex items-center gap-3 p-4 hover:shadow-md"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-blush-100 text-lush-600"><Icon className="h-5 w-5" /></span><span><span className="block text-xs text-muted">{t as string}</span><span className="break-all font-semibold">{v as string}</span></span></a>
          })}
          <div className="card flex items-center gap-3 p-4"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-blush-100 text-lush-600"><MapPin className="h-5 w-5" /></span><span><span className="block text-xs text-muted">Service area</span><span className="font-semibold">Padora &amp; B.B. Ganj, Bihar — and growing</span></span></div>
          <div className="card flex items-center gap-3 p-4"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-blush-100 text-lush-600"><Clock className="h-5 w-5" /></span><span className="text-sm text-muted">We usually reply within one working day.</span></div>
        </div>
        <div className="card p-5">
          {done ? <div className="py-8 text-center"><Heart className="mx-auto h-10 w-10 text-lush-600" /><h2 className="mt-2 font-display text-2xl font-semibold">Message sent</h2><p className="text-sm text-muted">Thank you! We will get back to you soon.</p></div> : (
            <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" noValidate>
              <Field label="Name" required error={err.name}><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></Field>
              <Field label="Email" error={err.email}><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" /></Field>
              <Field label="Phone"><input className="input" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" /></Field>
              <Field label="Subject" required error={err.subject}><input className="input" value={f.subject} maxLength={150} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
              <div className="sm:col-span-2"><Field label="Message" required error={err.message}><textarea className="input min-h-32" maxLength={2000} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></Field></div>
              <button className="btn btn-primary sm:col-span-2" disabled={busy}>{busy ? 'Sending…' : 'Send message'}</button>
            </form>)}
        </div>
      </div>
    </>
  )
}

const FAQS: [string, string][] = [
  ['How do I book a service?', 'Choose a service or salon, add it to your cart, pick a date and time slot, enter your details and confirm. The salon then accepts your request.'],
  ['What does “Awaiting salon” mean?', 'Your booking request has been placed and the slot is held. The salon must accept it; you are notified as soon as they do. Paid-online bookings are sent to the salon after payment.'],
  ['Can a beautician come to my home?', 'Yes, where a salon offers at-home service. Choose “At my home” in your cart and share your address and location so the beautician can reach you.'],
  ['How do I pay?', 'You can pay online (UPI, cards, netbanking, wallets) when online payments are enabled, or pay cash after the service.'],
  ['Can I cancel or reschedule?', 'You can cancel from My Orders until the service starts. To reschedule, cancel and book a new slot. See the Cancellation & Refund policy for refund rules.'],
  ['When do I get my refund?', 'Eligible refunds are sent to the original payment method once processed. Banks usually take 5–7 working days.'],
  ['How is my location used?', 'Only to show salons near you and, for at-home bookings, to share your address with the assigned salon. We ask before using your device location and you can search an area manually instead.'],
  ['How can I list my salon?', 'Go to Become a Partner, create an account and complete the registration. Our team reviews every salon before it goes live.'],
]
export function Faq() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <>
      <PageHero eyebrow="Help" title="Frequently asked questions" />
      <div className="container-x max-w-3xl space-y-3 py-8">
        {FAQS.map(([q, a], i) => (
          <div key={q} className="card">
            <button className="flex w-full items-center justify-between gap-3 p-4 text-left font-medium" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>{q}<ChevronDown className={`h-5 w-5 shrink-0 transition ${open === i ? 'rotate-180' : ''}`} /></button>
            {open === i && <p className="px-4 pb-4 text-sm text-muted">{a}</p>}
          </div>))}
        <p className="pt-2 text-sm text-muted">Still need help? <Link to="/contact" className="font-semibold text-lush-600 underline">Contact us</Link>.</p>
      </div>
    </>
  )
}

export function Help() {
  const cards: [string, string, string][] = [['Track a booking', 'See live status of your appointment.', '/track'], ['My orders', 'Cancel, rebook or rate a past visit.', '/orders'], ['Refund & cancellation', 'How cancellations and refunds work.', '/refund-policy'], ['FAQ', 'Quick answers to common questions.', '/faq'], ['Contact support', `Write to us or call ${BRAND.phone}.`, '/contact'], ['Partner help', 'List your salon and manage bookings.', '/partner']]
  return (
    <>
      <PageHero eyebrow="Support" title="How can we help?" />
      <div className="container-x grid gap-4 py-8 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(([t, d, to]) => <Link key={t} to={to} className="card p-5 transition hover:-translate-y-0.5 hover:shadow-md"><h3 className="font-display text-lg font-semibold">{t}</h3><p className="mt-1 text-sm text-muted">{d}</p></Link>)}
      </div>
    </>
  )
}

export function Privacy() {
  return (
    <Doc title="Privacy Policy" updated="October 2026">
      <p>Lushira (“we”, “us”) respects your privacy. This policy explains what we collect, why, and the choices you have. Questions: <Mail_ />.</p>
      <h2>Information we collect</h2>
      <ul><li>Account details: name, email address and mobile number.</li><li>Booking details: services, date and time, address for at-home services, notes you add.</li><li>Location: your device location only after you tap “Use My Current Location” and allow it in your browser, or an area you search manually. For at-home bookings, the service address and coordinates you provide.</li><li>Payment status: online payments are processed by Razorpay. We never see or store your card, UPI PIN or bank credentials.</li><li>Technical data needed to keep the service secure and working.</li></ul>
      <h2>How we use it</h2>
      <ul><li>To show salons near you and run your bookings.</li><li>To share your name, phone number and (for at-home bookings) address with the salon and assigned beautician for that booking only.</li><li>To send booking updates and, if you opt in, offers.</li><li>To prevent fraud, resolve disputes and meet legal obligations.</li></ul>
      <h2>Live location during at-home services</h2><p>A beautician’s live location is shared with you only while your at-home booking is active, and only if the beautician chooses to share it. It stops when the booking ends.</p>
      <h2>Sharing</h2><p>We do not sell your personal data. We share it with salons you book, payment and infrastructure providers who process it for us, and authorities where required by law.</p>
      <h2>Your choices</h2><ul><li>Download your data or request deletion from Profile → Privacy.</li><li>Turn promotional messages and location memory on or off at any time.</li><li>Withdraw browser location permission in your browser settings.</li></ul>
      <h2>Retention &amp; security</h2><p>We keep data while your account is active and as long as needed for bookings, accounting and legal requirements. Access is protected by authentication and database-level access rules.</p>
      <h2>Contact</h2><p>Lushira · <Mail_ /> · {BRAND.phone}</p>
    </Doc>
  )
}

export function Terms() {
  return (
    <Doc title="Terms & Conditions" updated="October 2026">
      <p>By using Lushira you agree to these terms.</p>
      <h2>Our role</h2><p>Lushira is a marketplace that lets you book services from independent salons and beauticians. Services are provided by the salon or beautician; Lushira facilitates discovery, booking and payment.</p>
      <h2>Bookings</h2><ul><li>A booking is a request until the salon confirms it.</li><li>Prices, durations and availability are set by salons. The final payable amount, including taxes, is calculated at checkout.</li><li>Please be available at the booked time and, for at-home services, provide an accurate address and a reachable phone number.</li></ul>
      <h2>Payments</h2><p>You can pay online through Razorpay or in cash after the service where available. Online bookings are confirmed to the salon only after payment succeeds.</p>
      <h2>Cancellations &amp; refunds</h2><p>See our <Link to="/refund-policy">Cancellation &amp; Refund Policy</Link>.</p>
      <h2>Conduct</h2><p>Be respectful to salon staff and beauticians. We may suspend accounts for fraud, abuse or false reviews.</p>
      <h2>Reviews</h2><p>Only customers with completed bookings can review. Reviews must be honest and lawful; we may remove content that is abusive or reported and found to violate these terms.</p>
      <h2>Liability</h2><p>Lushira is not responsible for the quality of services delivered by independent salons, but we will help resolve complaints. Our liability is limited to the amount you paid for the affected booking, to the extent permitted by law.</p>
      <h2>Changes &amp; contact</h2><p>We may update these terms and will post the latest version here. Contact <Mail_ />.</p>
    </Doc>
  )
}

export function Refund() {
  const s = useSettings()
  return (
    <Doc title="Cancellation & Refund Policy" updated="October 2026">
      <h2>Cancelling a booking</h2><p>You can cancel a booking from <Link to="/orders">My Orders</Link> any time before the service starts.</p>
      <h2>Online payments</h2>
      <ul><li><strong>Free cancellation:</strong> cancel at least <strong>{s.cancelHours} hours</strong> before the appointment and the full amount you paid is refunded.</li><li><strong>Late cancellation:</strong> within {s.cancelHours} hours of the appointment, the booking is cancelled but an automatic refund is not issued. You may request a review of your case from My Orders or by contacting us.</li><li>If the salon rejects or cannot fulfil your booking, you receive a full refund.</li></ul>
      <h2>Cash bookings</h2><p>Nothing is charged in advance. Please cancel early so the slot can go to someone else.</p>
      <h2>Refund timelines</h2><p>Approved refunds go to your original payment method. Banks and wallets usually take 5–7 working days after we process them.</p>
      <h2>Service issues</h2><p>If you are unhappy with a completed service, contact us within 48 hours at <Mail_ /> or {BRAND.phone} with your booking ID.</p>
    </Doc>
  )
}

export function NotFound() {
  return <div className="container-x py-16"><EmptyState title="Page not found" text="The page you are looking for does not exist or has moved." action={<Link to="/" className="btn btn-primary btn-sm">Go home</Link>} /></div>
}
export function Forbidden() {
  return <div className="container-x py-16"><EmptyState title="Access denied" text="You do not have permission to view this page." action={<Link to="/" className="btn btn-primary btn-sm">Go home</Link>} /></div>
}
