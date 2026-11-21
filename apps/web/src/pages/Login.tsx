import { useState, type FormEvent, type ReactNode } from 'react'
import { useAuth } from '../auth/auth'
import { ShieldMark } from '../components/Brand'

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="hero-step">
      <span className="hero-step-n" aria-hidden="true">{n}</span>
      <span><strong>{title}</strong><span className="hero-step-text">{children}</span></span>
    </li>
  )
}

export function Login({ heroArt }: { heroArt?: ReactNode }) {
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
      <section className="login-hero" aria-label="About AEGIS">
        <div className="login-hero-brand">
          <span className="brand-mark brand-mark-lg"><ShieldMark size={26} /></span>
          <span className="login-hero-name">AEGIS</span>
        </div>
        {heroArt && <div className="login-hero-art">{heroArt}</div>}
        <p className="login-hero-tag">Observe everything. Expose nothing. Explain every incident.</p>
        <ol className="hero-steps">
          <Step n={1} title="Raw stays local">Logs, users, IPs and secrets never leave the collector.</Step>
          <Step n={2} title="Metadata only">Allow-listed summaries with pseudonymous IDs, hash-verified.</Step>
          <Step n={3} title="Explained incidents">Correlated by dependency, with a grounded AI explanation.</Step>
        </ol>
      </section>
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
