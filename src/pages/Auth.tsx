import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { KeyRound, Mail, Smartphone } from 'lucide-react'
import { supabase, env } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { friendlyError } from '../lib/errors'
import { isEmail, normalizePhone } from '../lib/format'
import { Field, Logo, Spinner } from '../components/ui'

type Method = 'email' | 'password' | 'phone'
const MAX_ATTEMPTS = 5
const COOLDOWN = 30

export default function Auth({ mode }: { mode: 'login' | 'signup' }) {
  const { user, loading } = useAuth()
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const toast = useToast()
  const next = sp.get('next') && sp.get('next')!.startsWith('/') ? sp.get('next')! : '/'
  const [method, setMethod] = useState<Method>('email')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState<null | 'email' | 'phone'>(null)
  const [terms, setTerms] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [cool, setCool] = useState(0)
  const attempts = useRef(0)
  const signup = mode === 'signup'

  useEffect(() => { if (cool <= 0) return; const t = setTimeout(() => setCool((c) => c - 1), 1000); return () => clearTimeout(t) }, [cool])

  if (!loading && user) return <Navigate to={next} replace />

  const redirectTo = `${env.siteUrl}${next}`
  const fail = (e: unknown) => { setErr(friendlyError(e)); setBusy(false) }

  const sendCode = async () => {
    setErr('')
    if (signup && name.trim().length < 2) return setErr('Please enter your full name.')
    if (signup && !terms) return setErr('Please accept the Terms and Privacy Policy.')
    if (method === 'email' && !isEmail(email.trim())) return setErr('Please enter a valid email address.')
    const p = normalizePhone(phone)
    if (method === 'phone' && !p) return setErr('Please enter a valid mobile number.')
    setBusy(true)
    const data = signup ? { full_name: name.trim() } : undefined
    const r = method === 'phone'
      ? await supabase.auth.signInWithOtp({ phone: p!, options: { shouldCreateUser: signup, data } })
      : await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: signup, data, emailRedirectTo: redirectTo } })
    if (r.error) return fail(r.error)
    setBusy(false); setSent(method === 'phone' ? 'phone' : 'email'); setCool(COOLDOWN); attempts.current = 0; setCode('')
    toast.success(method === 'phone' ? 'OTP sent to your mobile.' : 'Check your email for the code.')
  }

  const verify = async (e: FormEvent) => {
    e.preventDefault(); setErr('')
    if (!/^\d{6,8}$/.test(code.trim())) return setErr('Enter the code from your message.')
    if (attempts.current >= MAX_ATTEMPTS) return setErr('Too many wrong attempts. Please request a new code.')
    setBusy(true); attempts.current += 1
    const t = code.trim()
    const r = sent === 'phone'
      ? await supabase.auth.verifyOtp({ phone: normalizePhone(phone)!, token: t, type: 'sms' })
      : await supabase.auth.verifyOtp({ email: email.trim(), token: t, type: 'email' })
    if (r.error) return fail(new Error(/expired|invalid/i.test(r.error.message) ? 'That code is incorrect or has expired.' : r.error.message))
    nav(next, { replace: true })
  }

  const passwordSubmit = async (e: FormEvent) => {
    e.preventDefault(); setErr('')
    if (signup && name.trim().length < 2) return setErr('Please enter your full name.')
    if (!isEmail(email.trim())) return setErr('Please enter a valid email address.')
    if (password.length < 8) return setErr('Password must be at least 8 characters.')
    if (signup && !terms) return setErr('Please accept the Terms and Privacy Policy.')
    setBusy(true)
    if (signup) {
      const r = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: name.trim() }, emailRedirectTo: redirectTo } })
      if (r.error) return fail(r.error)
      setBusy(false)
      if (!r.data.session) { setSent('email'); toast.info('Confirm your email to finish signing up.'); return }
      nav(next, { replace: true })
    } else {
      const r = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (r.error) return fail(new Error(/invalid login/i.test(r.error.message) ? 'Incorrect email or password.' : r.error.message))
      nav(next, { replace: true })
    }
  }

  const forgot = async () => {
    if (!isEmail(email.trim())) return setErr('Enter your email above first.')
    const r = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${env.siteUrl}/login` })
    if (r.error) return setErr(friendlyError(r.error))
    toast.success('Password reset link sent to your email.')
  }

  const tabs: { k: Method; l: string; icon: typeof Mail }[] = [{ k: 'email', l: 'Email OTP', icon: Mail }, { k: 'phone', l: 'Mobile OTP', icon: Smartphone }, { k: 'password', l: 'Password', icon: KeyRound }]

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md items-center px-4 py-10">
      <div className="card w-full p-6 sm:p-8">
        <div className="mb-4 flex justify-center"><Logo className="h-14" /></div>
        <h1 className="text-center text-2xl font-semibold">{signup ? 'Create your account' : 'Welcome back'}</h1>
        <p className="mb-5 text-center text-sm text-muted">{signup ? 'Book beauty services in minutes.' : 'Log in to manage your bookings.'}</p>

        {sent ? (
          <form onSubmit={verify} className="space-y-4" noValidate>
            <p className="rounded-xl bg-blush-100 p-3 text-sm">We sent a code to <strong>{sent === 'phone' ? phone : email}</strong>.{sent === 'email' && ' You can also tap the link in the email.'}</p>
            <Field label="Verification code"><input className="input text-center text-xl tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus /></Field>
            {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
            <button className="btn btn-primary w-full" disabled={busy}>{busy ? <Spinner /> : 'Verify & continue'}</button>
            <div className="flex justify-between text-sm">
              <button type="button" className="text-muted underline" onClick={() => { setSent(null); setErr('') }}>Change {sent === 'phone' ? 'number' : 'email'}</button>
              <button type="button" className="font-semibold text-lush-600 disabled:text-muted" disabled={cool > 0 || busy} onClick={() => void sendCode()}>{cool > 0 ? `Resend in ${cool}s` : 'Resend code'}</button>
            </div>
          </form>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-3 gap-1 rounded-full bg-blush-100 p-1" role="tablist">
              {tabs.map((t) => <button key={t.k} role="tab" aria-selected={method === t.k} onClick={() => { setMethod(t.k); setErr('') }} className={`flex items-center justify-center gap-1 rounded-full py-2 text-xs font-semibold ${method === t.k ? 'bg-white text-lush-600 shadow' : 'text-muted'}`}><t.icon className="h-3.5 w-3.5" />{t.l}</button>)}
            </div>
            <form onSubmit={method === 'password' ? passwordSubmit : (e) => { e.preventDefault(); void sendCode() }} className="space-y-4" noValidate>
              {signup && <Field label="Full name" required><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>}
              {method === 'phone' ? (
                env.phoneOtpEnabled ? <Field label="Mobile number" required><input className="input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="98765 43210" /></Field> :
                  <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Mobile OTP login is being set up and is not live yet. Please use Email OTP or a password for now.</p>
              ) : <Field label="Email" required><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>}
              {method === 'password' && <Field label="Password" required hint={signup ? 'At least 8 characters.' : undefined}><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={signup ? 'new-password' : 'current-password'} /></Field>}
              {signup && <label className="flex items-start gap-2 text-xs text-muted"><input type="checkbox" className="mt-0.5 accent-lush-600" checked={terms} onChange={(e) => setTerms(e.target.checked)} />I agree to the <Link to="/terms" className="underline">Terms</Link> and <Link to="/privacy" className="underline">Privacy Policy</Link>.</label>}
              {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
              <button className="btn btn-primary w-full" disabled={busy || (method === 'phone' && !env.phoneOtpEnabled)}>{busy ? <Spinner /> : method === 'password' ? (signup ? 'Create account' : 'Log in') : 'Send code'}</button>
              {method === 'password' && !signup && <button type="button" className="w-full text-center text-sm text-muted underline" onClick={forgot}>Forgot password?</button>}
            </form>
          </>
        )}
        <p className="mt-6 text-center text-sm text-muted">
          {signup ? <>Already have an account? <Link className="font-semibold text-lush-600" to={`/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}>Log in</Link></> :
            <>New to Lushira? <Link className="font-semibold text-lush-600" to={`/signup${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}>Create an account</Link></>}
        </p>
        <p className="mt-2 text-center text-xs text-muted">Salon owner? <Link className="underline" to="/partner">Become a partner</Link></p>
      </div>
    </div>
  )
}
