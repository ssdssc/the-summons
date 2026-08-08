import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ── Browser client (lazy singleton) ─────────────────────────────
// Using a function avoids module-level createClient() calls that
// throw "supabaseUrl is required" at build time when env vars
// aren't available in the Vercel build environment.

let _supabase: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _supabase
}

// Named export kept for backwards compat — call getSupabase() instead
// in server contexts; this is fine for client components.
// We use a getter so TypeScript sees the real SupabaseClient type.
export const supabase: SupabaseClient = new Proxy(
  {} as SupabaseClient,
  {
    get(_target: SupabaseClient, prop: string | symbol) {
      return (getSupabase() as any)[prop]
    },
  }
)

// ── Server-side admin client (for API routes - bypasses RLS) ─────
export const createAdminClient = (): SupabaseClient =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

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
