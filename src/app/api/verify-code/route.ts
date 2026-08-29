import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { randomUUID } from 'crypto'

export async function POST(req: NextRequest) {
  try {
    const { accessCode } = await req.json()

    if (!accessCode || typeof accessCode !== 'string') {
      return NextResponse.json({ error: 'Access code is required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Look up member by access code
    const { data: member, error: memberErr } = await supabase
      .from('members')
      .select('id, name, subject, is_captain, registration_id')
      .eq('access_code', accessCode.trim().toUpperCase())
      .single()

    if (memberErr || !member) {
      return NextResponse.json({ error: 'Invalid access code' }, { status: 404 })
    }

    // Generate a new session token — invalidates any existing session on another device
    const sessionToken = randomUUID()
    await supabase
      .from('members')
      .update({ session_token: sessionToken })
      .eq('id', member.id)

    // Get school name and logo
    const { data: registration } = await supabase
      .from('registrations')
      .select('school_name, logo_url')
      .eq('id', member.registration_id)
      .single()

    // Get quiz info for this subject
    const { data: quiz } = await supabase
      .from('quizzes')
      .select('id, title, scheduled_at, duration_minutes, status')
      .eq('subject', member.subject)
      .single()

    // Get current quiz state
    const { data: quizState } = await supabase
      .from('quiz_state')
      .select('status, current_question_index, started_at')
      .eq('subject', member.subject)
      .single()

    return NextResponse.json({
      sessionToken,
      member: {
        id: member.id,
        name: member.name,
        subject: member.subject,
        isCaptain: member.is_captain,
        accessCode: accessCode.trim().toUpperCase(),
      },
      school: {
        name: registration?.school_name ?? 'Unknown School',
        logoUrl: registration?.logo_url ?? null,
      },
      quiz: quiz ? {
        id: quiz.id,
        title: quiz.title,
        scheduledAt: quiz.scheduled_at,
        durationMinutes: quiz.duration_minutes,
        status: quizState?.status ?? quiz.status ?? 'waiting',
        currentQuestion: quizState?.current_question_index ?? -1,
        startedAt: quizState?.started_at,
      } : null,
    })
  } catch (err) {
    console.error('verify-code error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
