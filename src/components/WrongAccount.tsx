import { LogOut } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Spinner } from './ui'
import { useState } from 'react'

/** A customer-mobile login is a different account from a partner login, even for the same number. */
export const isCustomerAccount = (email?: string | null) => !!email && email.endsWith('@phone.lushira.app')

export default function WrongAccount() {
  const { signOut } = useAuth()
  const [busy, setBusy] = useState(false)
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="card space-y-3 p-6 text-center">
        <h1 className="text-xl font-semibold">You are logged in as a customer</h1>
        <p className="text-sm text-muted">Customer and partner accounts are separate, even with the same mobile number. Log out to sign up or log in to your partner account.</p>
        <button className="btn btn-primary w-full" disabled={busy} onClick={async () => { setBusy(true); await signOut(); setBusy(false) }}>{busy ? <Spinner /> : <><LogOut className="h-4 w-4" />Log out &amp; continue as partner</>}</button>
      </div>
    </div>
  )
}
