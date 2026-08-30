import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { memberId, sessionToken } = await req.json()

    if (!memberId || !sessionToken) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: member, error } = await supabase
      .from('members')
      .select('session_token')
      .eq('id', memberId)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: 'Session check temporarily unavailable' }, { status: 503 })
    }

    if (!member) {
      return NextResponse.json({ kicked: true, reason: 'member_not_found' })
    }

    if (member.session_token !== sessionToken) {
      // Token mismatch — another device has taken over this session
      return NextResponse.json({ kicked: true, reason: 'session_taken' })
    }

    return NextResponse.json({ kicked: false })
  } catch (err) {
    console.error('check-session error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
