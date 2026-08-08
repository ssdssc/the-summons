import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

// Middleware-style admin auth check
function checkAdminAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get('x-admin-token')
  return authHeader === process.env.ADMIN_PASSWORD
}

// ── GET: List all quizzes with question counts ──────────────
export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const { data: quizzes } = await supabase
    .from('quizzes')
    .select('*, questions(count)')
    .order('created_at')

  const { data: states } = await supabase.from('quiz_state').select('*')

  return NextResponse.json({ quizzes, states })
}

// ── POST: Create or update a quiz config ───────────────────
export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const supabase = createAdminClient()
  const { subject, title, scheduledAt, correctPoints, negativePoints } = body

  const { data: existing } = await supabase.from('quizzes').select('id').eq('subject', subject).single()

  if (existing) {
    await supabase.from('quizzes').update({
      title, scheduled_at: scheduledAt,
      correct_points: correctPoints ?? 4,
      negative_points: negativePoints ?? 1,
    }).eq('subject', subject)
  } else {
    await supabase.from('quizzes').insert({
      subject, title, scheduled_at: scheduledAt,
      correct_points: correctPoints ?? 4,
      negative_points: negativePoints ?? 1,
      status: 'waiting',
    })
    // Init quiz state
    await supabase.from('quiz_state').upsert({
      subject, status: 'waiting', current_question_index: -1,
    })
  }

  return NextResponse.json({ ok: true })
}
