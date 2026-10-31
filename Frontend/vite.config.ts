import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

// Production-only Content-Security-Policy. Dev needs inline scripts for hot reload, so it is not applied there.
const csp = (): Plugin => ({
  name: 'churchseeker-csp',
  apply: 'build',
  transformIndexHtml: () => [
    {
      tag: 'meta',
      attrs: {
        'http-equiv': 'Content-Security-Policy',
        content: [
          "default-src 'self'",
          "script-src 'self' 'wasm-unsafe-eval'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https://server.arcgisonline.com",
          "font-src 'self'",
          "connect-src 'self' https://server.arcgisonline.com",
          "worker-src 'self' blob:",
          "object-src 'none'",
          "base-uri 'none'",
          "form-action 'self'",
        ].join('; '),
      },
      injectTo: 'head-prepend',
    },
  ],
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), csp()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // Dev API (http profile). Override with API_TARGET, e.g. https://localhost:7228 (self-signed, hence secure: false).
      '/api': { target: process.env.API_TARGET ?? 'http://localhost:5054', changeOrigin: true, secure: false },
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
})
