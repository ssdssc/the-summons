import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

function checkAdminAuth(req: NextRequest): boolean {
  return req.headers.get('x-admin-token') === process.env.ADMIN_PASSWORD
}

const PREFIX: Record<string, string> = {
  biology: 'BIO', chemistry: 'CHE', physics: 'PHY', maths: 'MAT', 'combined maths': 'MAT'
}

function generateCode(subject: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let suffix = ''
  for (let i = 0; i < 4; i++) suffix += chars[Math.floor(Math.random() * chars.length)]
  return `${PREFIX[subject] ?? 'GEN'}-${suffix}`
}

// ── GET: List all raw registrations from evo_registrations ──
export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const { data: registrations, error } = await supabase
    .from('evo_registrations')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ registrations: registrations ?? [] })
}

// ── POST: Confirm an evo_registration (generate codes) ──────
export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const supabase = createAdminClient()
  
  // 1. Fetch the raw registration
  const { data: raw, error: fetchErr } = await supabase.from('evo_registrations').select('*').eq('id', id).single()
  if (fetchErr || !raw) return NextResponse.json({ error: fetchErr?.message || 'Not found' }, { status: 404 })
  if (raw.confirmed) return NextResponse.json({ error: 'Already confirmed' }, { status: 400 })

  // 2. Create the actual registration entry
  const { data: reg, error: regErr } = await supabase
    .from('registrations')
    .insert({ school_name: raw.school_name, contact_email: raw.email, status: 'active' })
    .select().single()
    
  if (regErr || !reg) return NextResponse.json({ error: regErr?.message || 'Failed to create registration' }, { status: 500 })

  // 3. Create the 4 members
  const membersData = [
    { registration_id: reg.id, name: raw.captain_name, subject: (raw.captain_subject || '').toLowerCase(), is_captain: true, access_code: generateCode((raw.captain_subject || '').toLowerCase()) },
    { registration_id: reg.id, name: raw.member1_name, subject: (raw.member1_subject || '').toLowerCase(), is_captain: false, access_code: generateCode((raw.member1_subject || '').toLowerCase()) },
    { registration_id: reg.id, name: raw.member2_name, subject: (raw.member2_subject || '').toLowerCase(), is_captain: false, access_code: generateCode((raw.member2_subject || '').toLowerCase()) },
    { registration_id: reg.id, name: raw.member3_name, subject: (raw.member3_subject || '').toLowerCase(), is_captain: false, access_code: generateCode((raw.member3_subject || '').toLowerCase()) },
  ]

  const { error: memErr } = await supabase.from('members').insert(membersData)
  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 })

  // 4. Mark evo_registrations as confirmed
  const { error: confErr } = await supabase.from('evo_registrations').update({ confirmed: true }).eq('id', id)
  if (confErr) return NextResponse.json({ error: confErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, registrationId: reg.id })
}

// ── DELETE: Remove a raw registration ────────────────────────
export async function DELETE(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const supabase = createAdminClient()
  const { error } = await supabase.from('evo_registrations').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
