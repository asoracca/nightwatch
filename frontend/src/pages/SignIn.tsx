import { useEffect, useRef, useState, type FormEvent } from 'react'
import { LogIn, UserPlus } from 'lucide-react'
import { BrandMark } from '../components/brand/BrandMark'
import { AmbientBackdrop } from '../experience/AmbientBackdrop'
import '../experience/experience.css'
import { supabaseConfigured } from '../lib/api'
import { useAuth } from '../lib/auth'
import './CommandCenter.css'
import '../styles/auth.css'

type Mode = 'signin' | 'signup' | 'confirm'

export default function SignIn() {
  const { signIn, signUp, resendConfirmation, configError } = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [retryAt, setRetryAt] = useState(0)
  const [now, setNow] = useState(Date.now())
  const seconds = Math.max(0, Math.ceil((retryAt - now) / 1000))
  useEffect(() => {
    if (!retryAt) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [retryAt])
  function cooldown(seconds = 60) {
    setNow(Date.now())
    setRetryAt(Date.now() + seconds * 1000)
  }
  function handleError(caught: unknown) {
    const message = caught instanceof Error ? caught.message : 'Unable to connect. Please try again.'
    const code = (caught as { code?: string })?.code
    const match = message.match(/after (\d+) seconds/i)
    if (/email rate limit exceeded/i.test(message)) {
      setError('The email service has reached its sending limit. Check for an existing confirmation email, or try again later. Creating another account will not help.')
    } else if (match || code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') {
      cooldown(match ? Number(match[1]) : 60)
      setError('Please wait for the countdown before trying again. If you already signed up, check your inbox and spam folder for the confirmation email.')
      if (mode === 'signup') setMode('confirm')
    } else if (code === 'email_not_confirmed') {
      setMode('confirm')
      setNotice('Confirm your email first, then return here to sign in.')
    } else if (code === 'email_address_not_authorized' || code === 'email_address_not_allowed' || /email rate limit exceeded/i.test(message)) {
      setError('The email service cannot send confirmation emails right now. Please try later or contact the NightWatch team. Repeated signup attempts will not help.')
    } else if (code === 'invalid_credentials') {
      setError('Email or password is incorrect. If you just created an account, confirm the email first.')
    } else {
      setError(message)
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current || (mode !== 'signin' && seconds > 0)) return
    inFlight.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const address = email.trim()
      if (mode === 'signin') {
        await signIn(address, password)
      } else if (mode === 'confirm') {
        await resendConfirmation(address)
        cooldown()
        setNotice('Confirmation email requested. Check your inbox and spam folder; use the newest link.')
      } else {
        const needsConfirmation = await signUp(address, password, '')
        if (needsConfirmation) {
          setPassword('')
          cooldown()
          setMode('confirm')
          setNotice('Check your inbox and spam folder. Open the confirmation link to finish signing up.')
        }
      }
    } catch (caught) {
      handleError(caught)
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  function switchMode(next: Mode) {
    setMode(next)
    setError('')
    setNotice('')
  }

  return (
    <>
      <AmbientBackdrop deferScene={false} />
      <main className="auth-stage" id="main-content">
        <section className="auth-card" aria-labelledby="auth-title">
          <div className="auth-brand"><BrandMark size={34} /><span>NightWatch</span></div>
          <h1 id="auth-title">{mode === 'confirm' ? 'Check your email' : mode === 'signin' ? 'Sign in to your workspace' : 'Create an account'}</h1>
          <p className="auth-lede">{mode === 'confirm'
            ? `Open the latest confirmation email sent to ${email.trim()}. The link brings you back to NightWatch. No need to create another account.`
            : 'Upload footage, review detections and explore your sensor recordings.'}</p>
          {!supabaseConfigured ? <p className="auth-error" role="alert">{configError}</p> : (
            <form className="auth-form" onSubmit={submit}>
              {mode !== 'confirm' && <>
                <label className="auth-field"><span>Email</span>
                  <input name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required disabled={busy} value={email} onChange={e => setEmail(e.target.value)} />
                </label>
                <label className="auth-field"><span>Password {mode === 'signup' && <small>at least 8 characters</small>}</span>
                  <input name="password" type={showPassword ? 'text' : 'password'} minLength={mode === 'signup' ? 8 : undefined} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required disabled={busy} value={password} onChange={e => setPassword(e.target.value)} />
                </label>
                <button className="auth-switch" type="button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide password' : 'Show password'}</button>
              </>}
              {(error || configError) && <p className="auth-error" role="alert">{error || configError}</p>}
              {notice && <p className="auth-notice" role="status">{notice}</p>}
              <button className="cc-button cc-button--primary auth-submit" type="submit" disabled={busy || (mode !== 'signin' && seconds > 0)}>
                {mode === 'signin' ? <LogIn size={15} aria-hidden="true" /> : <UserPlus size={15} aria-hidden="true" />}
                {busy ? 'Working…' : mode !== 'signin' && seconds > 0 ? `Try again in ${seconds}s` : mode === 'confirm' ? 'Resend confirmation email' : mode === 'signin' ? 'Sign in' : 'Create account'}
              </button>
              {mode === 'signup' && <p className="auth-lede">We’ll email you a confirmation link. Confirm once, then you’re ready.</p>}
              {mode === 'confirm' ? <>
                <button className="auth-switch" type="button" disabled={busy} onClick={() => switchMode('signin')}>I confirmed my email — sign in</button>
                <button className="auth-switch" type="button" disabled={busy} onClick={() => switchMode('signup')}>Use a different email</button>
              </> : <>
                <button className="auth-switch" type="button" disabled={busy} onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}>
                  {mode === 'signin' ? 'New here? Create an account' : 'Already registered? Sign in'}
                </button>
                {mode === 'signin' && <button className="auth-switch" type="button" disabled={busy || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())} onClick={() => switchMode('confirm')}>Need a confirmation email?</button>}
              </>}
            </form>
          )}
          <p className="auth-disclaimer">Prototype evaluation · Not safety-certified · Does not replace rescuers · Results depend on the uploaded footage and model.</p>
        </section>
      </main>
    </>
  )
}
