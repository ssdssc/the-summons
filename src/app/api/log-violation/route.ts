import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { memberId, quizId, type, at } = await req.json()

    if (!memberId || !type) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Find the quiz session for this member + quiz
    const { data: session } = await supabase
      .from('quiz_sessions')
      .select('id, cheat_flags')
      .eq('member_id', memberId)
      .eq('quiz_id', quizId)
      .single()

    const newFlag = { type, at: at ?? new Date().toISOString() }

    if (session) {
      const existing = Array.isArray(session.cheat_flags) ? session.cheat_flags : []
      await supabase
        .from('quiz_sessions')
        .update({ cheat_flags: [...existing, newFlag] })
        .eq('id', session.id)
    }
    // If no session yet (quiz not started), silently ignore

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('log-violation error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
