import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwind()],
  server: { proxy: { '/api': loadEnv(mode, '.', '').API_PROXY_TARGET || 'http://127.0.0.1:8000' } },
  test: { environment: 'jsdom', setupFiles: './src/test-setup.ts', globals: true, testTimeout: 15000 },
}))
