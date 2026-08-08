import { createClient } from '@supabase/supabase-js'

// Lazy singleton — avoids "supabaseUrl is required" at build time
// when env vars aren't available in the build environment.
let _supabase: ReturnType<typeof createClient> | null = null

export function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) throw new Error('Missing Supabase env vars')
    _supabase = createClient(url, key)
  }
  return _supabase
}

// Keep the named export for backwards compatibility with existing imports
export const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, prop) {
    return (getSupabase() as any)[prop]
  },
})

// Server-side admin client (for API routes - bypasses RLS)
export const createAdminClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export type Subject = 'biology' | 'chemistry' | 'physics' | 'maths'

export const SUBJECT_CONFIG = {
  biology: {
    label: 'Biology',
    color: '#22c55e',
    glow: '#22c55e40',
    short: 'BIO',
  },
  chemistry: {
    label: 'Chemistry',
    color: '#f59e0b',
    glow: '#f59e0b40',
    short: 'CHE',
  },
  physics: {
    label: 'Physics',
    color: '#006EAA',
    glow: '#006EAA40',
    short: 'PHY',
  },
  maths: {
    label: 'Combined Maths',
    color: '#a855f7',
    glow: '#a855f740',
    short: 'MAT',
  },
} as const
