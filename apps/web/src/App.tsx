import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/auth'
import { Layout } from './components/Layout'
import { Fleet } from './pages/Fleet'
import { Login } from './pages/Login'
import { Infrastructure, Network } from './pages/MetricsPage'
import { Overview } from './pages/Overview'
import { Security } from './pages/Security'
import { Settings } from './pages/Settings'
import { SourceDetail } from './pages/SourceDetail'

function Gate() {
  const { me, checking } = useAuth()
  if (checking) return <p className="muted center" role="status">Loading…</p>
  if (!me) return <Login />
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Overview />} />
        <Route path="fleet" element={<Fleet />} />
        <Route path="infrastructure" element={<Infrastructure />} />
        <Route path="network" element={<Network />} />
        <Route path="security" element={<Security />} />
        <Route path="sources/:pid" element={<SourceDetail />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<p className="empty">Page not found. <Link to="/">Back to overview</Link></p>} />
      </Route>
    </Routes>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  )
}
