import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import type { NotifyPayload } from '@/lib/notify-emitter'

// Minimum consecutive wrong answers before we consider a "comeback"
const COMEBACK_WRONG_THRESHOLD = 3
// Minimum consecutive correct answers after the wrong run to fire a comeback
const COMEBACK_CORRECT_THRESHOLD = 3
const VALID_OPTIONS = new Set(['A', 'B', 'C', 'D', 'E'])

function emitProjectorNotification(supabase: any, payload: NotifyPayload) {
  try {
    supabase
      .channel('projector-live-notifications')
      .send({ type: 'broadcast', event: 'notification', payload })
  } catch {
    // Ignore
  }
}

/**
 * Analyse the answers array of a session and fire a streak, streak_lost, or comeback event.
 */
function analyseAndNotify(
  supabase: any,
  answers: Array<{ isCorrect: boolean }>,
  schoolName: string,
  memberName: string,
  subject: string
) {
  if (!answers || answers.length === 0) return

  const lastAnswer = answers[answers.length - 1]

  // If latest answer is WRONG, emit streak_lost so projector can remove the card immediately
  if (!lastAnswer.isCorrect) {
    let previousStreak = 0
    for (let i = answers.length - 2; i >= 0 && answers[i].isCorrect; i--) previousStreak++
    if (previousStreak < 3) return

    const payload: NotifyPayload = {
      type: 'streak_lost',
      schoolName,
      memberName,
      subject,
      count: 0,
    }
    emitProjectorNotification(supabase, payload)
    return
  }

  // Count consecutive correct answers from the end of the list
  let correctStreak = 0
  for (let i = answers.length - 1; i >= 0; i--) {
    if (answers[i].isCorrect) correctStreak++
    else break
  }

  // ── COMEBACK: when hitting 3 correct answers following >= 3 wrong answers
  if (correctStreak === COMEBACK_CORRECT_THRESHOLD) {
    let wrongRun = 0
    const startOfCorrectRun = answers.length - correctStreak
    for (let i = startOfCorrectRun - 1; i >= 0; i--) {
      if (!answers[i].isCorrect) wrongRun++
      else break
    }

    if (wrongRun >= COMEBACK_WRONG_THRESHOLD) {
      const payload: NotifyPayload = {
        type: 'comeback',
        schoolName,
        memberName,
        subject,
        count: correctStreak,
      }
      emitProjectorNotification(supabase, payload)
      return
    }
  }

  // ── STREAK: starts at 3 and upgrades with each continued correct answer (x3, x4, x5...)
  if (correctStreak >= 3) {
    const payload: NotifyPayload = {
      type: 'streak',
      schoolName,
      memberName,
      subject,
      count: correctStreak,
    }
    emitProjectorNotification(supabase, payload)
  }
}

async function checkSpecialEventsAndNotify(
  supabase: any,
  quizId: string,
  subject: string,
  isCorrect: boolean,
  newScore: number,
  sessionId: string | undefined,
  schoolName: string,
  memberName: string,
  state: any,
  clientAnsweredAt?: string
) {
  if (!isCorrect) return

  // 1. Check for Lightning Fast Answer (< 3.5 seconds)
  // Use clientAnsweredAt if available — this is when the user actually tapped,
  // making the check fair regardless of network speed
  const tapTime = clientAnsweredAt
    ? new Date(clientAnsweredAt).getTime()
    : Date.now()

  if (state?.question_started_at) {
    const elapsedSec = (tapTime - new Date(state.question_started_at).getTime()) / 1000
    if (elapsedSec > 0.3 && elapsedSec <= 3.5) {
      emitProjectorNotification(supabase, {
        type: 'fast',
        schoolName,
        memberName,
        subject,
        count: `${elapsedSec.toFixed(1)}s`,
      })
    }
  }

  // 2. Check for Leaderboard Overtake (#1 Spot)
  try {
    const { data: topSessions } = await supabase
      .from('quiz_sessions')
      .select('id, total_score')
      .eq('quiz_id', quizId)
      .eq('subject', subject)
      .order('total_score', { ascending: false })
      .limit(2)

    if (topSessions && topSessions.length > 1) {
      const leader = topSessions[0]
      const secondPlace = topSessions[1]
      if (sessionId && leader.id === sessionId && newScore > secondPlace.total_score) {
        // Only trigger overtake if this answer pushed them past previous 1st place
        if (newScore - (secondPlace.total_score || 0) <= 20) {
          emitProjectorNotification(supabase, {
            type: 'overtake',
            schoolName,
            memberName,
            subject,
            count: '#1',
          })
        }
      }
    }
  } catch {
    // Non-critical, ignore
  }
}

export async function POST(req: NextRequest) {
  try {
    const { memberId, quizId, subject, questionId, selectedOption, questionIndex, clientAnsweredAt, sessionToken } = await req.json()

    if (
      !memberId || !quizId || !subject || !questionId || !sessionToken ||
      !Number.isInteger(questionIndex) || questionIndex < 0 ||
      typeof selectedOption !== 'string' || !VALID_OPTIONS.has(selectedOption)
    ) {
      return NextResponse.json({ error: 'Invalid answer submission' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const parsedClientTime = typeof clientAnsweredAt === 'string' ? Date.parse(clientAnsweredAt) : NaN
    const safeClientAnsweredAt = Number.isFinite(parsedClientTime) ? clientAnsweredAt : undefined

    // ── Run independent queries in parallel for speed ──────────
    const [stateResult, questionResult, memberResult] = await Promise.all([
      supabase
        .from('quiz_state')
        .select('status, current_question_index, question_started_at')
        .eq('subject', subject)
        .single(),
      supabase
        .from('questions')
        .select('id, quiz_id, order_index, correct_option, points, negative_points, time_seconds')
        .eq('id', questionId)
        .eq('quiz_id', quizId)
        .eq('order_index', questionIndex)
        .maybeSingle(),
      supabase
        .from('members')
        .select('name, subject, session_token, registrations(school_name)')
        .eq('id', memberId)
        .maybeSingle(),
    ])

    if (stateResult.error || questionResult.error || memberResult.error) {
      console.error('submit-answer validation query failed')
      return NextResponse.json({ error: 'Database temporarily unavailable' }, { status: 503 })
    }

    const state = stateResult.data
    const question = questionResult.data
    const memberRow = memberResult.data

    if (!memberRow || memberRow.session_token !== sessionToken) {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 })
    }
    if (memberRow.subject !== subject) {
      return NextResponse.json({ error: 'Member is not assigned to this subject' }, { status: 403 })
    }
    if (!state || state.status !== 'active') {
      return NextResponse.json({ error: 'Quiz is not active' }, { status: 403 })
    }
    if (state.current_question_index !== questionIndex) {
      return NextResponse.json({ error: 'Answer submitted for a different question' }, { status: 409 })
    }
    if (!question) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 })
    }

    const questionStart = state.question_started_at ? Date.parse(state.question_started_at) : NaN
    const timeLimitSec = question.time_seconds ?? 120
    if (!Number.isFinite(questionStart) || Date.now() > questionStart + (timeLimitSec * 1000) + 2000) {
      return NextResponse.json({ error: 'Answer window has closed' }, { status: 409 })
    }

    const isCorrect = selectedOption === question.correct_option
    const pointsEarned = isCorrect ? (question.points ?? 0) : 0

    const memberName: string = (memberRow as any)?.name ?? '—'
    const schoolName: string = (memberRow as any)?.registrations?.school_name ?? '—'

    // Upsert the session and append this answer
    const { data: existingSession, error: sessionReadError } = await supabase
      .from('quiz_sessions')
      .select('id, answers, total_score')
      .eq('member_id', memberId)
      .eq('quiz_id', quizId)
      .maybeSingle()

    if (sessionReadError) {
      console.error('submit-answer session read failed')
      return NextResponse.json({ error: 'Could not load answer session' }, { status: 503 })
    }

    let updatedAnswers: Array<{ isCorrect: boolean }> = []
    let updatedScore = pointsEarned
    let activeSessionId = existingSession?.id

    // Compute response time in seconds (from question start to client tap)
    let responseTimeSec: number | null = null
    if (safeClientAnsweredAt) {
      responseTimeSec = parseFloat(
        ((parsedClientTime - questionStart) / 1000).toFixed(2)
      )
      if (responseTimeSec < 0) responseTimeSec = null
    }

    let isReAnswer = false

    if (existingSession) {
      const answers = Array.isArray(existingSession.answers) ? existingSession.answers as any[] : []
      const alreadyAnsweredIndex = answers.findIndex((a: any) => a.questionId === questionId)

      const newAnswer = {
        questionId,
        questionIndex,
        selectedOption,
        correctOption: question.correct_option,
        isCorrect,
        pointsEarned,
        answeredAt: new Date().toISOString(),
        clientAnsweredAt: safeClientAnsweredAt ?? null,
        responseTimeSec,
      }

      let newAnswers = [...answers]
      
      if (alreadyAnsweredIndex >= 0) {
        // It's a re-answer! Remove old points, add new points
        isReAnswer = true
        const oldAnswer = answers[alreadyAnsweredIndex]
        updatedScore = (existingSession.total_score ?? 0) - (oldAnswer.pointsEarned ?? 0) + pointsEarned
        newAnswers[alreadyAnsweredIndex] = newAnswer
      } else {
        // First time answering this question
        newAnswers.push(newAnswer)
        updatedScore = (existingSession.total_score ?? 0) + pointsEarned
      }

      updatedScore = Math.max(0, updatedScore)
      const { error: updateError } = await supabase
        .from('quiz_sessions')
        .update({ answers: newAnswers, total_score: updatedScore })
        .eq('id', existingSession.id)

      if (updateError) {
        console.error('submit-answer session update failed')
        return NextResponse.json({ error: 'Answer was not saved' }, { status: 503 })
      }

      updatedAnswers = newAnswers
    } else {
      // Create new session
      const newAnswer = {
        questionId,
        questionIndex,
        selectedOption,
        correctOption: question.correct_option,
        isCorrect,
        pointsEarned,
        answeredAt: new Date().toISOString(),
        clientAnsweredAt: safeClientAnsweredAt ?? null,
        responseTimeSec,
      }
      const { data: insertedSession, error: insertError } = await supabase.from('quiz_sessions').insert({
        member_id: memberId,
        quiz_id: quizId,
        subject,
        answers: [newAnswer],
        total_score: Math.max(0, pointsEarned),
        started_at: new Date().toISOString(),
      }).select('id').single()

      if (insertError || !insertedSession) {
        const status = insertError?.code === '23505' ? 409 : 503
        return NextResponse.json({ error: status === 409 ? 'Concurrent answer submission' : 'Answer was not saved' }, { status })
      }

      activeSessionId = insertedSession.id
      updatedAnswers = [newAnswer]
    }

    analyseAndNotify(supabase, updatedAnswers, schoolName, memberName, subject)

    // Fast/overtake notifications only fire on the first attempt.
    if (!isReAnswer) {
      void checkSpecialEventsAndNotify(
        supabase,
        quizId,
        subject,
        isCorrect,
        updatedScore,
        activeSessionId,
        schoolName,
        memberName,
        state,
        safeClientAnsweredAt
      )
    }

    return NextResponse.json({ isCorrect, pointsEarned, correctOption: question.correct_option })
  } catch (err) {
    console.error('submit-answer error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
