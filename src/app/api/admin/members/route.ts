import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

function checkAdminAuth(req: NextRequest): boolean {
  return req.headers.get('x-admin-token') === process.env.ADMIN_PASSWORD
}

const SUBJECTS = ['biology', 'chemistry', 'physics', 'maths'] as const
const PREFIX: Record<string, string> = {
  biology: 'BIO', chemistry: 'CHE', physics: 'PHY', maths: 'MAT',
}

function generateCode(subject: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let suffix = ''
  for (let i = 0; i < 4; i++) suffix += chars[Math.floor(Math.random() * chars.length)]
  return `${PREFIX[subject] ?? 'GEN'}-${suffix}`
}

// ── GET: List members for a registration ────────────────────
export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const registrationId = req.nextUrl.searchParams.get('registrationId')
  if (!registrationId) return NextResponse.json({ error: 'registrationId required' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: members, error } = await supabase
    .from('members')
    .select('*')
    .eq('registration_id', registrationId)
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ members: members ?? [] })
}

// ── POST: Add a new member with auto-generated access code ──
export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { registrationId, name, subject, isCaptain } = await req.json()
  if (!registrationId || !name || !subject) {
    return NextResponse.json({ error: 'registrationId, name, and subject required' }, { status: 400 })
  }
  if (!SUBJECTS.includes(subject)) {
    return NextResponse.json({ error: 'Invalid subject' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Generate a unique access code (retry up to 10 times on collision)
  let accessCode = ''
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateCode(subject)
    const { data: existing } = await supabase
      .from('members')
      .select('id')
      .eq('access_code', candidate)
      .single()
    if (!existing) { accessCode = candidate; break }
  }
  if (!accessCode) return NextResponse.json({ error: 'Could not generate unique code' }, { status: 500 })

  const { data, error } = await supabase
    .from('members')
    .insert({ registration_id: registrationId, name, subject, is_captain: isCaptain ?? false, access_code: accessCode })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ member: data })
}

// ── PATCH: Update member details ────────────────────────────
export async function PATCH(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, name, subject, isCaptain } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const supabase = createAdminClient()
  const updates: any = {}
  if (name !== undefined) updates.name = name
  if (subject !== undefined) updates.subject = subject
  if (isCaptain !== undefined) updates.is_captain = isCaptain

  const { error } = await supabase.from('members').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// ── DELETE: Remove a member ─────────────────────────────────
export async function DELETE(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const supabase = createAdminClient()
  const { error } = await supabase.from('members').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
