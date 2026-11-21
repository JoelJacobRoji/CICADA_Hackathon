import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted variable fonts (bundled woff2; satisfies CSP font-src 'self').
import '@fontsource-variable/inter/wght.css'
import '@fontsource-variable/jetbrains-mono/wght.css'
import './index.css'
import { App } from './App.tsx'
import { applyTheme, storedTheme } from './lib/theme'

applyTheme(storedTheme()) // before first paint: dark by default

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
