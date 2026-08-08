import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Browser client (for real-time subscriptions in components)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Server-side admin client (for API routes - bypasses RLS)
export const createAdminClient = () =>
  createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

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
