import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { KeyRound, Smartphone } from 'lucide-react'
import { Field, Spinner } from './ui'
import PasswordInput from './PasswordInput'
import { cleanMobile, loginWithMobilePassword, sendMobileOtp, verifyMobileOtp, type AccountKind, type OtpPurpose } from '../lib/mobileAuth'

/** Mobile-number-only signup / login / password reset with OTP. Calls onAuthed() once signed in. */
export default function MobileAccount({ mode, onAuthed, kind = 'customer' }: { mode: 'login' | 'signup'; onAuthed: () => void | Promise<void>; kind?: AccountKind }) {
  const [reset, setReset] = useState(false)
  const [method, setMethod] = useState<'otp' | 'password'>('otp')
  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [terms, setTerms] = useState(false)
  const [codeSent, setCodeSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [cool, setCool] = useState(0)
  const signup = mode === 'signup'
  const purpose: OtpPurpose = reset ? 'reset' : signup ? 'signup' : 'login'
  const needsPassword = signup || reset
  const m = cleanMobile(mobile)

  useEffect(() => { setReset(false); setCodeSent(false); setErr(''); setCode('') }, [mode])
  useEffect(() => { if (cool <= 0) return; const t = setTimeout(() => setCool((c) => c - 1), 1000); return () => clearTimeout(t) }, [cool])

  const run = async (fn: () => Promise<void>) => {
    setErr(''); setBusy(true)
    try { await fn() } catch (e) { setErr(e instanceof Error ? e.message : 'Something went wrong.') } finally { setBusy(false) }
  }

  const validate = () => {
    if (signup && name.trim().length < 2) return 'Please enter your full name.'
    if (!m) return 'Enter a valid 10-digit mobile number (without +91 or 0).'
    if (needsPassword && password.length < 8) return 'Password must be at least 8 characters.'
    if (signup && !terms) return 'Please accept the Terms and Privacy Policy.'
    return ''
  }

  const send = () => {
    const v = validate(); if (v) return setErr(v)
    void run(async () => { setCool(await sendMobileOtp(m!, purpose, kind)); setCodeSent(true); setCode('') })
  }
  const verify = (e: FormEvent) => {
    e.preventDefault()
    if (!/^\d{6}$/.test(code)) return setErr('Enter the 6-digit code.')
    void run(async () => {
      await verifyMobileOtp({ kind, mobile: m!, purpose, code, full_name: signup ? name.trim() : undefined, password: needsPassword ? password : undefined })
      await onAuthed()
    })
  }
  const passwordLogin = (e: FormEvent) => {
    e.preventDefault()
    if (!m) return setErr('Enter a valid 10-digit mobile number.')
    if (!password) return setErr('Enter your password.')
    void run(async () => { await loginWithMobilePassword(m, password, kind); await onAuthed() })
  }

  if (codeSent) {
    return (
      <form onSubmit={verify} className="space-y-4" noValidate>
        <p className="rounded-xl bg-blush-100 p-3 text-sm">We sent a 6-digit code by SMS to <strong>+91 {m}</strong>. It is valid for 10 minutes.</p>
        <Field label="Verification code"><input className="input text-center text-xl tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus /></Field>
        {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? <Spinner /> : reset ? 'Verify & reset password' : signup ? 'Verify & create account' : 'Verify & log in'}</button>
        <div className="flex justify-between text-sm">
          <button type="button" className="text-muted underline" onClick={() => { setCodeSent(false); setErr('') }}>Change number</button>
          <button type="button" className="font-semibold text-lush-600 disabled:text-muted" disabled={cool > 0 || busy} onClick={send}>{cool > 0 ? `Resend in ${cool}s` : 'Resend code'}</button>
        </div>
      </form>
    )
  }

  const mobileField = <Field label="Mobile number" required hint="10-digit Indian number"><div className="flex gap-2"><span className="input flex w-16 items-center justify-center text-muted">+91</span><input className="input flex-1" inputMode="numeric" autoComplete="tel-national" maxLength={14} value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="98765 43210" /></div></Field>

  if (!signup && !reset) {
    return (
      <div>
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-full bg-blush-100 p-1" role="tablist">
          {([['otp', 'Mobile OTP', Smartphone], ['password', 'Password', KeyRound]] as const).map(([k, l, I]) => (
            <button key={k} type="button" role="tab" aria-selected={method === k} onClick={() => { setMethod(k); setErr('') }} className={`flex items-center justify-center gap-1 rounded-full py-2 text-xs font-semibold ${method === k ? 'bg-white text-lush-600 shadow' : 'text-muted'}`}><I className="h-3.5 w-3.5" />{l}</button>
          ))}
        </div>
        <form onSubmit={method === 'password' ? passwordLogin : (e) => { e.preventDefault(); send() }} className="space-y-4" noValidate>
          {mobileField}
          {method === 'password' && <Field label="Password" required><PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></Field>}
          {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
          <button className="btn btn-primary w-full" disabled={busy}>{busy ? <Spinner /> : method === 'password' ? 'Log in' : 'Send OTP'}</button>
          {method === 'password' && <button type="button" className="w-full text-center text-sm text-muted underline" onClick={() => { setReset(true); setPassword(''); setErr('') }}>Forgot password?</button>}
        </form>
      </div>
    )
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); send() }} className="space-y-4" noValidate>
      {reset && <p className="text-sm text-muted">Enter your mobile number and a new password. We will send an OTP to confirm it is you.</p>}
      {signup && <Field label="Full name" required><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>}
      {mobileField}
      <Field label={reset ? 'New password' : 'Create password'} required hint="At least 8 characters. You can use it to log in later."><PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></Field>
      {signup && <label className="flex items-start gap-2 text-xs text-muted"><input type="checkbox" className="mt-0.5 accent-lush-600" checked={terms} onChange={(e) => setTerms(e.target.checked)} />I agree to the <Link to="/terms" className="underline">Terms</Link> and <Link to="/privacy" className="underline">Privacy Policy</Link>.</label>}
      {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
      <button className="btn btn-primary w-full" disabled={busy}>{busy ? <Spinner /> : 'Send OTP'}</button>
      {reset && <button type="button" className="w-full text-center text-sm text-muted underline" onClick={() => { setReset(false); setErr('') }}>Back to login</button>}
    </form>
  )
}
