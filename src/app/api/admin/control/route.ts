import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

function checkAdminAuth(req: NextRequest): boolean {
  return req.headers.get('x-admin-token') === process.env.ADMIN_PASSWORD
}

// ── Start Quiz ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { action, subject } = await req.json()
  const supabase = createAdminClient()

  switch (action) {
    case 'start': {
      // Verify there are questions
      const { data: quiz } = await supabase.from('quizzes').select('id').eq('subject', subject).single()
      if (!quiz) return NextResponse.json({ error: 'Quiz not found' }, { status: 404 })

      const { count } = await supabase
        .from('questions')
        .select('id', { count: 'exact', head: true })
        .eq('quiz_id', quiz.id)

      if (!count || count === 0) {
        return NextResponse.json({ error: 'No questions added yet' }, { status: 400 })
      }

      const now = new Date().toISOString()
      await supabase.from('quiz_state').upsert({
        subject,
        status: 'active',
        current_question_index: 0,
        started_at: now,
        question_started_at: now,
      })
      await supabase.from('quizzes').update({ status: 'active' }).eq('subject', subject)
      return NextResponse.json({ ok: true, action: 'started' })
    }

    case 'next': {
      const { data: state } = await supabase
        .from('quiz_state')
        .select('current_question_index')
        .eq('subject', subject)
        .single()

      if (!state) return NextResponse.json({ error: 'Quiz state not found' }, { status: 404 })

      const nextIndex = state.current_question_index + 1

      // Check if there are more questions
      const { data: quiz } = await supabase.from('quizzes').select('id').eq('subject', subject).single()
      const { count } = await supabase
        .from('questions')
        .select('id', { count: 'exact', head: true })
        .eq('quiz_id', quiz!.id)

      if (nextIndex >= (count ?? 0)) {
        // Auto-end quiz
        await supabase.from('quiz_state').update({
          status: 'ended',
          ended_at: new Date().toISOString(),
          current_question_index: nextIndex,
        }).eq('subject', subject)
        await supabase.from('quizzes').update({ status: 'ended' }).eq('subject', subject)
        return NextResponse.json({ ok: true, action: 'ended' })
      }

      await supabase.from('quiz_state').update({
        current_question_index: nextIndex,
        question_started_at: new Date().toISOString(),
      }).eq('subject', subject)

      return NextResponse.json({ ok: true, action: 'next', questionIndex: nextIndex })
    }

    case 'end': {
      await supabase.from('quiz_state').update({
        status: 'ended',
        ended_at: new Date().toISOString(),
      }).eq('subject', subject)
      await supabase.from('quizzes').update({ status: 'ended' }).eq('subject', subject)
      return NextResponse.json({ ok: true, action: 'ended' })
    }

    case 'reset': {
      // Reset quiz back to waiting — clears all sessions for a fresh start
      const { data: quiz } = await supabase.from('quizzes').select('id').eq('subject', subject).single()
      if (quiz) {
        await supabase.from('quiz_sessions').delete().eq('subject', subject)
      }
      await supabase.from('quiz_state').update({
        status: 'waiting',
        current_question_index: -1,
        started_at: null,
        ended_at: null,
        question_started_at: null,
      }).eq('subject', subject)
      await supabase.from('quizzes').update({ status: 'waiting' }).eq('subject', subject)
      return NextResponse.json({ ok: true, action: 'reset' })
    }

    case 'publish_results': {
      // Calculate final scores and ranks for all sessions of this subject
      const { data: sessions } = await supabase
        .from('quiz_sessions')
        .select('id, member_id, total_score')
        .eq('subject', subject)
        .order('total_score', { ascending: false })

      if (sessions) {
        let rank = 1
        for (const session of sessions) {
          await supabase
            .from('quiz_sessions')
            .update({ rank, completed_at: new Date().toISOString() })
            .eq('id', session.id)
          rank++
        }
      }

      await supabase.from('quiz_state').update({ status: 'results_published' }).eq('subject', subject)
      await supabase.from('quizzes').update({ status: 'results_published' }).eq('subject', subject)
      return NextResponse.json({ ok: true, action: 'results_published' })
    }

    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
}

// ── GET: Live analytics for a subject ─────────────────────
export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const subject = req.nextUrl.searchParams.get('subject')
  if (!subject) return NextResponse.json({ error: 'Subject required' }, { status: 400 })

  const supabase = createAdminClient()

  const { data: state } = await supabase.from('quiz_state').select('*').eq('subject', subject).single()
  const { data: quiz } = await supabase.from('quizzes').select('id, correct_points, negative_points').eq('subject', subject).single()

  let sessions: any[] = []
  let questions: any[] = []

  if (quiz) {
    const { data: s } = await supabase
      .from('quiz_sessions')
      .select(`
        id, total_score, rank, answers, cheat_flags,
        members!inner(id, name, registration_id,
          registrations!inner(school_name))
      `)
      .eq('subject', subject)

    sessions = s ?? []

    const { data: q } = await supabase
      .from('questions')
      .select('id, order_index, correct_option, question_text, time_seconds')
      .eq('quiz_id', quiz.id)
      .order('order_index')

    questions = q ?? []
  }

  return NextResponse.json({ state, sessions, questions, quiz })
}
