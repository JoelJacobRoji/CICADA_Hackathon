import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/auth'

export function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(email, password)
    } catch (err) {
      setError((err as Error).message === 'too many attempts'
        ? 'Too many attempts. Wait a minute and try again.'
        : 'Sign-in failed. Check your email and password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <form className="login-card" onSubmit={submit} aria-labelledby="login-title">
        <p className="eyebrow">AEGIS · operator console</p>
        <h1 id="login-title">Sign in</h1>
        <p className="muted">
          Metadata-only observability. Raw telemetry stays inside each customer environment.
        </p>
        <label>
          Email
          <input type="email" autoComplete="username" required value={email}
            onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input type="password" autoComplete="current-password" required value={password}
            onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="error-note" role="alert">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}
