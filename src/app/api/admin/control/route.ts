import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

function checkAdminAuth(req: NextRequest): boolean {
  return req.headers.get('x-admin-token') === process.env.ADMIN_PASSWORD
}

// ── Start Quiz ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { action, subject } = await req.json()
    const supabase = createAdminClient()

    switch (action) {
    case 'start': {
      // Verify there are questions
      const { data: quiz } = await supabase.from('quizzes').select('id').eq('subject', subject).maybeSingle().throwOnError()
      if (!quiz) return NextResponse.json({ error: 'Quiz not found' }, { status: 404 })

      const { count } = await supabase
        .from('questions')
        .select('id', { count: 'exact', head: true })
        .eq('quiz_id', quiz.id)
        .throwOnError()

      if (!count || count === 0) {
        return NextResponse.json({ error: 'No questions added yet' }, { status: 400 })
      }

      const now = new Date().toISOString()
      await Promise.all([
        supabase.from('quiz_state').upsert({
          subject,
          status: 'active',
          current_question_index: 0,
          started_at: now,
          question_started_at: now,
        }).throwOnError(),
        supabase.from('quizzes').update({ status: 'active' }).eq('subject', subject).throwOnError(),
      ])
      return NextResponse.json({ ok: true, action: 'started' })
    }

    case 'next': {
      const { data: state } = await supabase
        .from('quiz_state')
        .select('current_question_index')
        .eq('subject', subject)
        .maybeSingle()
        .throwOnError()

      if (!state) return NextResponse.json({ error: 'Quiz state not found' }, { status: 404 })

      const nextIndex = state.current_question_index + 1

      // Check if there are more questions
      const { data: quiz } = await supabase.from('quizzes').select('id').eq('subject', subject).maybeSingle().throwOnError()
      if (!quiz) return NextResponse.json({ error: 'Quiz not found' }, { status: 404 })
      const { count } = await supabase
        .from('questions')
        .select('id', { count: 'exact', head: true })
        .eq('quiz_id', quiz.id)
        .throwOnError()

      if (nextIndex >= (count ?? 0)) {
        // Auto-end quiz
        await Promise.all([
          supabase.from('quiz_state').update({
            status: 'ended',
            ended_at: new Date().toISOString(),
          }).eq('subject', subject).throwOnError(),
          supabase.from('quizzes').update({ status: 'ended' }).eq('subject', subject).throwOnError(),
        ])
        return NextResponse.json({ ok: true, action: 'ended' })
      }

      await supabase.from('quiz_state').update({
        current_question_index: nextIndex,
        question_started_at: new Date().toISOString(),
      }).eq('subject', subject).throwOnError()

      return NextResponse.json({ ok: true, action: 'next', questionIndex: nextIndex })
    }

    case 'end': {
      await Promise.all([
        supabase.from('quiz_state').update({
          status: 'ended',
          ended_at: new Date().toISOString(),
        }).eq('subject', subject).throwOnError(),
        supabase.from('quizzes').update({ status: 'ended' }).eq('subject', subject).throwOnError(),
      ])
      return NextResponse.json({ ok: true, action: 'ended' })
    }

    case 'reset': {
      // Reset quiz back to waiting — clears all sessions for a fresh start
      const { data: quiz } = await supabase.from('quizzes').select('id').eq('subject', subject).maybeSingle().throwOnError()
      if (quiz) {
        await supabase.from('quiz_sessions').delete().eq('subject', subject).throwOnError()
      }
      await Promise.all([
        supabase.from('quiz_state').update({
          status: 'waiting',
          current_question_index: -1,
          started_at: null,
          ended_at: null,
          question_started_at: null,
        }).eq('subject', subject).throwOnError(),
        supabase.from('quizzes').update({ status: 'waiting' }).eq('subject', subject).throwOnError(),
      ])
      return NextResponse.json({ ok: true, action: 'reset' })
    }

    case 'publish_results': {
      // Calculate final scores and ranks for all sessions of this subject
      const { data: sessions } = await supabase
        .from('quiz_sessions')
        .select('id, member_id, total_score')
        .eq('subject', subject)
        .order('total_score', { ascending: false })
        .throwOnError()

      if (sessions && sessions.length > 0) {
        const completedAt = new Date().toISOString()
        // Standard competition ranking (1-2-2-4): tied scores share the same rank,
        // and the next rank is skipped by the number of tied players.
        let rank = 1
        const updates = []
        for (let i = 0; i < sessions.length; i++) {
          // If this player has the same score as the previous, reuse that rank
          if (i > 0 && sessions[i].total_score === sessions[i - 1].total_score) {
            // rank stays the same — will be updated below using the same value
          } else {
            rank = i + 1  // position-based rank (skips over tied positions)
          }
          updates.push(supabase
            .from('quiz_sessions')
            .update({ rank, completed_at: completedAt })
            .eq('id', sessions[i].id)
            .throwOnError())
        }
        await Promise.all(updates)
      }

      await Promise.all([
        supabase.from('quiz_state').update({ status: 'results_published' }).eq('subject', subject).throwOnError(),
        supabase.from('quizzes').update({ status: 'results_published' }).eq('subject', subject).throwOnError(),
      ])
      return NextResponse.json({ ok: true, action: 'results_published' })
    }

    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (err) {
    console.error('quiz control error:', err)
    return NextResponse.json({ error: 'Quiz control temporarily unavailable' }, { status: 503 })
  }
}

// ── GET: Live analytics for a subject ─────────────────────
export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const subject = req.nextUrl.searchParams.get('subject')
  if (!subject) return NextResponse.json({ error: 'Subject required' }, { status: 400 })

  try {
    const supabase = createAdminClient()
    const [stateResult, quizResult] = await Promise.all([
      supabase.from('quiz_state').select('*').eq('subject', subject).maybeSingle().throwOnError(),
      supabase.from('quizzes').select('id, correct_points, negative_points').eq('subject', subject).maybeSingle().throwOnError(),
    ])
    const state = stateResult.data
    const quiz = quizResult.data

    let sessions: any[] = []
    let questions: any[] = []

    if (quiz) {
      const [sessionsResult, questionsResult] = await Promise.all([
        supabase
          .from('quiz_sessions')
          .select(`
            id, member_id, total_score, rank, answers, cheat_flags,
            members!inner(id, name, registration_id,
              registrations!inner(school_name))
          `)
          .eq('subject', subject)
          .throwOnError(),
        supabase
          .from('questions')
          .select('id, order_index, correct_option, question_text, time_seconds')
          .eq('quiz_id', quiz.id)
          .order('order_index')
          .throwOnError(),
      ])

      sessions = sessionsResult.data ?? []
      questions = questionsResult.data ?? []
    }

    return NextResponse.json({ state, sessions, questions, quiz })
  } catch (err) {
    console.error('quiz analytics error:', err)
    return NextResponse.json({ error: 'Analytics temporarily unavailable' }, { status: 503 })
  }
}
