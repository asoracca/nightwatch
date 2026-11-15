import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// On Windows, run from an uppercase drive path (E:\…, not e:\…); a lowercase drive letter makes Node load
// vitest twice and every suite fails with "failed to find the current suite".
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
    // Tests must never reach a real Supabase project or API.
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_API_URL: '' },
  },
})
