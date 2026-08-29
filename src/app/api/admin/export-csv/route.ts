import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

function checkAdminAuth(req: NextRequest): boolean {
  return req.headers.get('x-admin-token') === process.env.ADMIN_PASSWORD
}

function escapeCSV(val: unknown): string {
  const s = val === null || val === undefined ? '' : String(val)
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const subject = req.nextUrl.searchParams.get('subject')
  if (!subject) return NextResponse.json({ error: 'Subject required' }, { status: 400 })

  const supabase = createAdminClient()

  // Get quiz for this subject
  const { data: quiz } = await supabase.from('quizzes').select('id').eq('subject', subject).single()
  if (!quiz) return NextResponse.json({ error: 'Quiz not found' }, { status: 404 })

  // Get all questions (for total count and per-question info)
  const { data: questions } = await supabase
    .from('questions')
    .select('id, order_index, question_text, correct_option, points')
    .eq('quiz_id', quiz.id)
    .order('order_index')
  const totalQuestions = questions?.length ?? 0

  // Get all sessions with member + school info
  const { data: sessions } = await supabase
    .from('quiz_sessions')
    .select(`
      id, total_score, rank, answers, cheat_flags,
      member_id,
      members!inner(name, registrations!inner(school_name))
    `)
    .eq('subject', subject)
    .order('rank', { ascending: true })

  if (!sessions) return NextResponse.json({ error: 'No data' }, { status: 404 })

  // Build CSV rows
  const headers = [
    'Rank', 'School', 'Member', 'Score',
    'Correct', 'Wrong', 'Skipped',
    'Accuracy %', 'Avg Response (s)', 'Violations',
  ]

  const rows = sessions.map((s: any) => {
    const m = s.members as any
    const answers = (s.answers ?? []) as any[]
    const correct = answers.filter((a: any) => a.isCorrect).length
    const wrong = answers.filter((a: any) => a.selectedOption && !a.isCorrect).length
    const skipped = totalQuestions - answers.length
    const accuracy = totalQuestions > 0 ? Math.round((correct / totalQuestions) * 100) : 0
    const responseTimes = answers.map((a: any) => a.responseTimeSec).filter((t: any) => typeof t === 'number' && t >= 0)
    const avgResponse = responseTimes.length > 0
      ? (responseTimes.reduce((a: number, b: number) => a + b, 0) / responseTimes.length).toFixed(1)
      : ''
    const flags = Array.isArray(s.cheat_flags) ? s.cheat_flags.length : 0

    return [
      s.rank ?? '',
      m?.registrations?.school_name ?? '',
      m?.name ?? '',
      s.total_score ?? 0,
      correct, wrong, skipped,
      `${accuracy}%`,
      avgResponse,
      flags,
    ].map(escapeCSV).join(',')
  })

  const csv = [headers.join(','), ...rows].join('\r\n')
  const subjectLabel = subject.charAt(0).toUpperCase() + subject.slice(1)
  const filename = `summons-${subject}-results-${new Date().toISOString().slice(0, 10)}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
