import { useState, type FormEvent } from 'react'
import { LogIn, UserPlus } from 'lucide-react'
import { BrandMark } from '../components/brand/BrandMark'
import { AmbientBackdrop } from '../experience/AmbientBackdrop'
import '../experience/experience.css'
import { supabaseConfigured } from '../lib/api'
import { useAuth } from '../lib/auth'
import './CommandCenter.css'
import '../styles/auth.css'

type Mode = 'signin' | 'signup'

export default function SignIn() {
  const { signIn, signUp, configError } = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '').trim()
    const password = String(form.get('password') ?? '')
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (mode === 'signin') {
        await signIn(email, password)
      } else {
        const needsConfirmation = await signUp(email, password, String(form.get('username') ?? '').trim())
        if (needsConfirmation) {
          setNotice('Check your email to confirm the account, then sign in.')
          setMode('signin')
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <AmbientBackdrop deferScene={false} />
      <main className="auth-stage" id="main-content">
        <section className="auth-card" aria-labelledby="auth-title">
          <div className="auth-brand">
            <BrandMark size={34} />
            <span>NightWatch</span>
          </div>
          <h1 id="auth-title">{mode === 'signin' ? 'Sign in to your workspace' : 'Create an account'}</h1>
          <p className="auth-lede">
            Measure detection and tracking on your own footage under clear, low-light, fog and blur conditions.
          </p>

          {!supabaseConfigured ? (
            <p className="auth-error" role="alert">{configError}</p>
          ) : (
            <form className="auth-form" onSubmit={submit}>
              <label className="auth-field">
                <span>Email</span>
                <input name="email" type="email" autoComplete="email" required disabled={busy} />
              </label>
              <label className="auth-field">
                <span>Password</span>
                <input
                  name="password"
                  type="password"
                  minLength={8}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  required
                  disabled={busy}
                />
              </label>
              {mode === 'signup' && (
                <label className="auth-field">
                  <span>Username <small>display only</small></span>
                  <input name="username" maxLength={80} autoComplete="username" disabled={busy} />
                </label>
              )}

              {error && <p className="auth-error" role="alert">{error}</p>}
              {notice && <p className="auth-notice" role="status">{notice}</p>}

              <button className="cc-button cc-button--primary auth-submit" type="submit" disabled={busy}>
                {mode === 'signin' ? <LogIn size={15} aria-hidden="true" /> : <UserPlus size={15} aria-hidden="true" />}
                {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
              </button>
              <button
                className="auth-switch"
                type="button"
                disabled={busy}
                onClick={() => {
                  setMode(mode === 'signin' ? 'signup' : 'signin')
                  setError('')
                }}
              >
                {mode === 'signin' ? 'New here? Create an account' : 'Already registered? Sign in'}
              </button>
            </form>
          )}

          <p className="auth-disclaimer">
            Prototype evaluation · Not safety-certified · Does not replace rescuers · Results depend on the uploaded
            footage and model.
          </p>
        </section>
      </main>
    </>
  )
}
