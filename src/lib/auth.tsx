// ============================================================
// Tracque — auth context (Supabase email/password)
// ============================================================
// Gate applies only when a Supabase project is configured (LIVE).
// Demo mode (no env vars) stays open — nothing real to protect.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../integrations/supabase/client'

export const AUTH_ENABLED = Boolean(import.meta.env.VITE_SUPABASE_URL)

interface AuthState {
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState>({
  session: null, loading: false,
  signIn: async () => 'auth disabled', signUp: async () => 'auth disabled', signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(AUTH_ENABLED)

  useEffect(() => {
    if (!AUTH_ENABLED) return
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? error.message : null
  }
  async function signUp(email: string, password: string) {
    const { error } = await supabase.auth.signUp({ email, password })
    return error ? error.message : null
  }
  async function signOut() { await supabase.auth.signOut() }

  return (
    <AuthContext.Provider value={{ session, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() { return useContext(AuthContext) }
