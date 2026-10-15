import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { isEmail } from '../lib/format'
import { Field, LogoMark, Spinner } from '../components/ui'
import MobileAccount from '../components/MobileAccount'

export default function Auth({ mode, defaultNext = '/', partner = false }: { mode: 'login' | 'signup'; defaultNext?: string; partner?: boolean }) {
  const { user, loading, isPartner, isAdmin } = useAuth()
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const next = sp.get('next') && sp.get('next')!.startsWith('/') ? sp.get('next')! : defaultNext
  const signup = mode === 'signup'
  const adminLogin = !signup && (sp.get('admin') === '1' || next.startsWith('/admin'))
  const [showAdmin, setShowAdmin] = useState(adminLogin)

  if (!loading && user) return <Navigate to={isPartner && !isAdmin && !next.startsWith('/partner') ? '/partner/dashboard' : next} replace />

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md items-center px-4 py-10">
      <div className="card w-full p-6 sm:p-8">
        <div className="mb-4 flex justify-center"><LogoMark size="h-14 w-14" /></div>
        <h1 className="text-center text-2xl font-semibold">{showAdmin ? 'Admin login' : partner ? 'Partner login' : signup ? 'Create your account' : 'Welcome back'}</h1>
        <p className="mb-5 text-center text-sm text-muted">{showAdmin ? 'Team members only.' : signup ? 'Sign up with your mobile number.' : 'Log in with your mobile number.'}</p>

        {showAdmin ? <AdminEmailLogin onDone={() => nav(next, { replace: true })} /> : <MobileAccount mode={mode} onAuthed={() => nav(next, { replace: true })} />}

        {!partner && !showAdmin && <p className="mt-6 text-center text-sm text-muted">
          {signup ? <>Already have an account? <Link className="font-semibold text-lush-600" to={`/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}>Log in</Link></> :
            <>New to Lushira? <Link className="font-semibold text-lush-600" to={`/signup${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}>Create an account</Link></>}
        </p>}
        {partner ? <p className="mt-2 text-center text-xs text-muted">New salon? <Link className="underline" to="/partner/register">Register your salon</Link></p> : !showAdmin && <p className="mt-2 text-center text-xs text-muted">Salon owner? <Link className="underline" to="/partner">Become a partner</Link></p>}
        {!signup && !partner && <p className="mt-3 text-center text-xs"><button className="text-muted underline" onClick={() => setShowAdmin(!showAdmin)}>{showAdmin ? 'Back to mobile login' : 'Admin? Log in with email'}</button></p>}
      </div>
    </div>
  )
}

function AdminEmailLogin({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr('')
    if (!isEmail(email.trim()) || !password) return setErr('Enter your email and password.')
    setBusy(true)
    const r = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (r.error) return setErr('Incorrect email or password.')
    onDone()
  }
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Email" required><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
      <Field label="Password" required><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></Field>
      {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
      <button className="btn btn-primary w-full" disabled={busy}>{busy ? <Spinner /> : 'Log in'}</button>
    </form>
  )
}
