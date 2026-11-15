import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'

// Configuration lives in ONE file: the repository-root .env, shared with the backend and worker.
// Only the allowlisted public values below reach the browser bundle. The service-role key never does.
const ROOT = fileURLToPath(new URL('..', import.meta.url))

function claimsOf(key) {
  try {
    return JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

export default defineConfig(({ mode }) => {
  // '' = read every key from the root .env (and from process.env, e.g. on Vercel).
  const env = loadEnv(mode, ROOT, '')
  const pick = (...keys) => keys.map((key) => env[key]).find((value) => value && value.trim()) ?? ''

  const supabaseUrl = pick('SUPABASE_URL', 'VITE_SUPABASE_URL').replace(/\/+$/, '')
  const anonKey = pick('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY')
  const apiUrl = pick('API_URL', 'VITE_API_URL').replace(/\/+$/, '')

  if (anonKey.startsWith('sb_secret_') || claimsOf(anonKey)?.role === 'service_role') {
    throw new Error('SUPABASE_ANON_KEY holds a service-role/secret key. Refusing to put it in the browser bundle.')
  }

  return {
    envDir: ROOT,
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(anonKey),
      'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl),
    },
    // Port 3000 matches the backend's default CORS origin (FRONTEND_ORIGIN=http://localhost:3000).
    server: { port: 3000, strictPort: true },
    preview: { port: 3000, strictPort: true },
  }
})
