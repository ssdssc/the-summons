export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, type Subject } from '@/lib/supabase'

function checkAdminAuth(req: NextRequest): boolean {
  return true
}

const SUBJECTS: Subject[] = ['biology', 'chemistry', 'physics', 'maths']

export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const results: Record<string, any[]> = {}

  // Fetch top 20 for each subject in parallel
  await Promise.all(
    SUBJECTS.map(async (subject) => {
      const { data } = await supabase
        .from('quiz_sessions')
        .select(`
          id, total_score, rank,
          members!inner(id, name, registrations!inner(school_name, logo_url))
        `)
        .eq('subject', subject)
        .order('total_score', { ascending: false })
        .limit(6)

      results[subject] = data?.map((s: any) => ({
        sessionId: s.id,
        memberId: s.members?.id,
        memberName: s.members?.name ?? '—',
        schoolName: s.members?.registrations?.school_name ?? '—',
        logoUrl: s.members?.registrations?.logo_url ?? null,
        score: s.total_score ?? 0,
      })) ?? []
    })
  )

  // Fetch max possible scores and question counts for each subject
  const maxScores: Record<string, number> = {}
  const questionCounts: Record<string, number> = {}

  const { data: quizList } = await supabase
    .from('quizzes')
    .select('id, subject, correct_points')

  if (quizList) {
    await Promise.all(
      quizList.map(async (q) => {
        const { data: qs } = await supabase
          .from('questions')
          .select('points')
          .eq('quiz_id', q.id)

        const count = qs?.length || 0
        maxScores[q.subject] = count
        questionCounts[q.subject] = count
      })
    )
  }

  // Determine active subject: if set to 'auto', check if any quiz is currently active
  let currentActiveSubject = 'auto'
  
  // 1. Fetch saved config from DB
  const { data: configRow } = await supabase
    .from('quiz_state')
    .select('status')
    .eq('subject', 'projector_config')
    .maybeSingle()
    
  if (configRow?.status) {
    currentActiveSubject = configRow.status
  }

  // 2. If 'auto', find an active quiz
  if (currentActiveSubject === 'auto') {
    const { data: activeState } = await supabase
      .from('quiz_state')
      .select('subject')
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()
    if (activeState?.subject && activeState.subject !== 'projector_config') {
      currentActiveSubject = activeState.subject
    }
  }

  return NextResponse.json({ 
    leaderboards: results,
    activeSubject: currentActiveSubject || 'auto',
    maxScores,
    questionCounts,
  })
}

export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { subject } = await req.json()
  
  const targetSubject = subject || 'auto'
  
  const supabase = createAdminClient()
  await supabase.from('quiz_state').upsert({
    subject: 'projector_config',
    status: targetSubject,
    current_question_index: -1,
  })
  
  return NextResponse.json({ ok: true, activeSubject: targetSubject })
}
