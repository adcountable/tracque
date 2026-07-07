import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Home, Loader2 } from 'lucide-react'
import { useAuth, AUTH_ENABLED } from '../lib/auth'

export default function Login() {
  const { session, signIn, signUp } = useAuth()
  const location = useLocation()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const from = (location.state as { from?: string } | null)?.from ?? '/app/properties'
  if (!AUTH_ENABLED || session) return <Navigate to={from} replace />

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null); setNotice(null)
    const err = mode === 'signin' ? await signIn(email, password) : await signUp(email, password)
    if (err) setError(err)
    else if (mode === 'signup') setNotice('Account created. If email confirmation is on, check your inbox — then sign in.')
    setBusy(false)
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 justify-center mb-6">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
            <Home className="w-5 h-5 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <span className="font-semibold text-lg tracking-tight text-foreground">Tracque</span>
        </div>

        <div className="bg-card rounded-2xl border border-border shadow-card p-6">
          <h1 className="font-semibold text-foreground mb-1">{mode === 'signin' ? 'Sign in' : 'Create account'}</h1>
          <p className="text-xs text-muted-foreground mb-4">Your pipeline is private — an account is required.</p>

          <form onSubmit={submit} className="space-y-3">
            <label className="block text-xs text-muted-foreground">Email
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground" />
            </label>
            <label className="block text-xs text-muted-foreground">Password
              <input type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground" />
            </label>
            {error && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
            {notice && <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">{notice}</div>}
            <button type="submit" disabled={busy}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-60">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : (mode === 'signin' ? 'Sign in' : 'Create account')}
            </button>
          </form>

          <button onClick={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setError(null); setNotice(null) }}
            className="mt-4 text-xs text-muted-foreground hover:text-foreground w-full text-center">
            {mode === 'signin' ? "Need an account? Create one" : 'Have an account? Sign in'}
          </button>
        </div>

        <p className="text-[11px] text-muted-foreground text-center mt-4">
          Owner tip: after creating your account, disable public signups in Supabase → Authentication.
        </p>
      </div>
    </div>
  )
}
