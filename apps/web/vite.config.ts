/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Dev: the UI calls same-origin /api/*; Vite proxies it to the SaaS API (local by default).
// Production: nginx serves the built files and proxies /api on the same host.
const API_TARGET = process.env.AEGIS_API_TARGET ?? 'http://127.0.0.1:9001'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true, ws: true, secure: true },
    },
  },
  preview: { host: '127.0.0.1', port: 5180, strictPort: true },
  build: { chunkSizeWarningLimit: 900 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
