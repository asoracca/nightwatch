import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseConfigured } from './api'

interface AuthState {
  /** False until the stored session has been read. */
  ready: boolean
  session: Session | null
  token: string
  userId: string | null
  displayName: string
  email: string
  configError: string
  signIn: (email: string, password: string) => Promise<void>
  /** Resolves to true when the account still needs email confirmation. */
  signUp: (email: string, password: string, username: string) => Promise<boolean>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [configError, setConfigError] = useState('')

  useEffect(() => {
    if (!supabaseConfigured) {
      setConfigError('Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in the repository-root .env, then restart npm run dev.')
      setReady(true)
      return
    }
    const client = supabase()
    let active = true
    client.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) setConfigError(error.message)
      setSession(data.session)
      setReady(true)
    })
    // Supabase refreshes the access token itself; this keeps our copy current.
    const { data } = client.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthState>(() => {
    const user = session?.user
    const username = typeof user?.user_metadata?.username === 'string' ? user.user_metadata.username : ''
    return {
      ready,
      session,
      token: session?.access_token ?? '',
      userId: user?.id ?? null,
      email: user?.email ?? '',
      displayName: username || user?.email?.split('@')[0] || 'Operator',
      configError,
      async signIn(email, password) {
        const { error } = await supabase().auth.signInWithPassword({ email, password })
        if (error) throw error
      },
      async signUp(email, password, username) {
        const { data, error } = await supabase().auth.signUp({
          email,
          password,
          options: { data: { username } },
        })
        if (error) throw error
        return !data.session
      },
      async signOut() {
        const { error } = await supabase().auth.signOut()
        if (error) throw error
      },
    }
  }, [configError, ready, session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
