import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

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
      .select('status, current_question_index')
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
    const pointsEarned = isCorrect ? question.points : -question.negative_points

    // Upsert the session and append this answer
    const { data: existingSession } = await supabase
      .from('quiz_sessions')
      .select('id, answers, total_score')
      .eq('member_id', memberId)
      .eq('quiz_id', quizId)
      .single()

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
      const newScore = existingSession.total_score + pointsEarned

      await supabase
        .from('quiz_sessions')
        .update({ answers: newAnswers, total_score: newScore })
        .eq('id', existingSession.id)
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
      await supabase.from('quiz_sessions').insert({
        member_id: memberId,
        quiz_id: quizId,
        subject,
        answers: [newAnswer],
        total_score: Math.max(0, pointsEarned), // don't go below 0 on first answer
        started_at: new Date().toISOString(),
      })
    }

    return NextResponse.json({ isCorrect, pointsEarned, correctOption: question.correct_option })
  } catch (err) {
    console.error('submit-answer error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
