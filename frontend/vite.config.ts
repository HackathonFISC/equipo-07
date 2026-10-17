import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwind()],
  server: { proxy: { '/api': 'http://127.0.0.1:8001' } },
  test: { environment: 'jsdom', setupFiles: './src/test-setup.ts', globals: true, testTimeout: 15000 },
})
