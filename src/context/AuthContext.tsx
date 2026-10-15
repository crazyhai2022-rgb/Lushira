import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { AppRole, Profile } from '../lib/types'

interface AuthState {
  session: Session | null
  user: User | null
  profile: Profile | null
  roles: AppRole[]
  loading: boolean
  isAdmin: boolean
  isPartner: boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [roles, setRoles] = useState<AppRole[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (!s) {
        setProfile(null)
        setRoles([])
        setLoading(false)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id

  const load = useCallback(async () => {
    if (!userId) return
    const [p, r] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('user_roles').select('role').eq('user_id', userId),
    ])
    setProfile((p.data as Profile) ?? null)
    setRoles(((r.data ?? []) as { role: AppRole }[]).map((x) => x.role))
    setLoading(false)
  }, [userId])

  useEffect(() => {
    // deferred so we never call Supabase from inside the auth callback
    if (userId) {
      const t = setTimeout(() => void load(), 0)
      return () => clearTimeout(t)
    }
  }, [userId, load])

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      roles,
      loading,
      isAdmin: roles.includes('admin'),
      isPartner: roles.includes('partner'),
      refresh: load,
      signOut: async () => {
        await supabase.auth.signOut()
      },
    }),
    [session, profile, roles, loading, load],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used inside AuthProvider')
  return v
}
