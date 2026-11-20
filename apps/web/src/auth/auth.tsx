import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, setUnauthorizedHandler } from '../api/client'
import type { Me } from '../api/types'
import { live } from '../live/live'

interface AuthState {
  me: Me | null
  checking: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    setUnauthorizedHandler(() => {
      live.stop()
      setMe(null)
    })
    api<Me>('/api/v1/auth/me')
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setChecking(false))
  }, [])

  useEffect(() => {
    if (me) live.start()
    else live.stop()
  }, [me])

  const login = useCallback(async (email: string, password: string) => {
    const r = await api<Me>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    setMe(r)
  }, [])

  const logout = useCallback(async () => {
    try {
      await api('/api/v1/auth/logout', { method: 'POST' })
    } finally {
      live.stop()
      setMe(null)
    }
  }, [])

  return <Ctx.Provider value={{ me, checking, login, logout }}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth outside AuthProvider')
  return v
}
