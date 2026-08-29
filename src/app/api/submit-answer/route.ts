import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import type { NotifyPayload } from '@/lib/notify-emitter'

// Minimum consecutive wrong answers before we consider a "comeback"
const COMEBACK_WRONG_THRESHOLD = 3
// Minimum consecutive correct answers after the wrong run to fire a comeback
const COMEBACK_CORRECT_THRESHOLD = 3

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
  state: any
) {
  if (!isCorrect) return

  // 1. Check for Lightning Fast Answer (< 3.5 seconds)
  if (state?.question_started_at) {
    const elapsedSec = (Date.now() - new Date(state.question_started_at).getTime()) / 1000
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
    const { memberId, quizId, subject, questionId, selectedOption, questionIndex } = await req.json()

    if (!memberId || !quizId || !subject || !questionId || !selectedOption) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Verify quiz is still active
    const { data: state } = await supabase
      .from('quiz_state')
      .select('status, current_question_index, question_started_at')
      .eq('subject', subject)
      .single()

    if (!state || state.status !== 'active') {
      return NextResponse.json({ error: 'Quiz is not active' }, { status: 403 })
    }

    // Get the correct answer for scoring
    const { data: question } = await supabase
      .from('questions')
      .select('id, correct_option, points, negative_points')
      .eq('id', questionId)
      .single()

    if (!question) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 })
    }

    const isCorrect = selectedOption === question.correct_option
    const pointsEarned = isCorrect ? question.points : 0

    // Fetch the school/member info we need for notifications
    const { data: memberRow } = await supabase
      .from('members')
      .select('name, registrations(school_name)')
      .eq('id', memberId)
      .single()

    const memberName: string = (memberRow as any)?.name ?? '—'
    const schoolName: string = (memberRow as any)?.registrations?.school_name ?? '—'

    // Upsert the session and append this answer
    const { data: existingSession } = await supabase
      .from('quiz_sessions')
      .select('id, answers, total_score')
      .eq('member_id', memberId)
      .eq('quiz_id', quizId)
      .single()

    let updatedAnswers: Array<{ isCorrect: boolean }> = []
    let updatedScore = pointsEarned
    let activeSessionId = existingSession?.id

    if (existingSession) {
      // Check if already answered this question
      const answers = existingSession.answers as any[]
      const alreadyAnswered = answers.find((a: any) => a.questionId === questionId)
      if (alreadyAnswered) {
        return NextResponse.json({ error: 'Already answered' }, { status: 409 })
      }

      const newAnswer = {
        questionId,
        questionIndex,
        selectedOption,
        correctOption: question.correct_option,
        isCorrect,
        pointsEarned,
        answeredAt: new Date().toISOString(),
      }
      const newAnswers = [...answers, newAnswer]
      updatedScore = existingSession.total_score + pointsEarned

      await supabase
        .from('quiz_sessions')
        .update({ answers: newAnswers, total_score: updatedScore })
        .eq('id', existingSession.id)

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
      }
      const { data: insertedSession } = await supabase.from('quiz_sessions').insert({
        member_id: memberId,
        quiz_id: quizId,
        subject,
        answers: [newAnswer],
        total_score: Math.max(0, pointsEarned),
        started_at: new Date().toISOString(),
      }).select('id').single()

      activeSessionId = insertedSession?.id
      updatedAnswers = [newAnswer]
    }

    // Fire-and-forget streak/comeback/loss detection
    analyseAndNotify(supabase, updatedAnswers, schoolName, memberName, subject)

    // Check additional live events (overtake, lightning fast answer)
    checkSpecialEventsAndNotify(
      supabase,
      quizId,
      subject,
      isCorrect,
      updatedScore,
      activeSessionId,
      schoolName,
      memberName,
      state
    )

    return NextResponse.json({ isCorrect, pointsEarned, correctOption: question.correct_option })
  } catch (err) {
    console.error('submit-answer error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
