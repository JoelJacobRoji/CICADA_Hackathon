import { useEffect, useState } from 'react'

type Status = 'checking' | 'ok' | 'unreachable'

const SERVICES = [
  { name: 'SaaS API', url: 'http://127.0.0.1:9001/healthz' },
  { name: 'Collector (local)', url: 'http://127.0.0.1:9100/healthz' },
] as const

async function probe(url: string): Promise<Status> {
  try {
    const r = await fetch(url)
    return r.ok ? 'ok' : 'unreachable'
  } catch {
    return 'unreachable'
  }
}

export function App() {
  const [status, setStatus] = useState<Record<string, Status>>(
    Object.fromEntries(SERVICES.map((s) => [s.name, 'checking'])),
  )

  useEffect(() => {
    SERVICES.forEach(async (s) => {
      const st = await probe(s.url)
      setStatus((prev) => ({ ...prev, [s.name]: st }))
    })
  }, [])

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <p className="text-xs uppercase tracking-[0.2em] text-ink-muted">Phase 2 · foundation build</p>
      <h1 className="mt-2 text-3xl font-semibold">AEGIS</h1>
      <p className="mt-2 text-ink-muted">
        Privacy-first observability. This screen only checks that the services are up. It shows no
        operational data.
      </p>
      <ul className="mt-8 divide-y divide-white/10 rounded-lg bg-surface-raised">
        {SERVICES.map((s) => (
          <li key={s.name} className="flex items-center justify-between px-4 py-3">
            <span>{s.name}</span>
            <span data-testid={`status-${s.name}`} className="font-mono text-sm">
              {status[s.name]}
            </span>
          </li>
        ))}
      </ul>
    </main>
  )
}
