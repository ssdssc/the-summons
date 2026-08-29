import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

function checkAdminAuth(req: NextRequest): boolean {
  return req.headers.get('x-admin-token') === process.env.ADMIN_PASSWORD
}

// ── GET: List all registrations with member counts ──────────
export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const { data: registrations, error } = await supabase
    .from('registrations')
    .select('*, members(count)')
    .order('registered_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ registrations: registrations ?? [] })
}

// ── POST: Create a new school registration ──────────────────
export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { schoolName, contactEmail, logoUrl } = await req.json()
  if (!schoolName) return NextResponse.json({ error: 'School name required' }, { status: 400 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('registrations')
    .insert({ school_name: schoolName, contact_email: contactEmail ?? '', logo_url: logoUrl ?? null, status: 'active' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ registration: data })
}

// ── PATCH: Update school name / logo ────────────────────────
export async function PATCH(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, schoolName, contactEmail, logoUrl } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const supabase = createAdminClient()
  const updates: any = {}
  if (schoolName !== undefined) updates.school_name = schoolName
  if (contactEmail !== undefined) updates.contact_email = contactEmail
  if (logoUrl !== undefined) updates.logo_url = logoUrl

  const { error } = await supabase.from('registrations').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// ── DELETE: Remove a registration (cascades members) ────────
export async function DELETE(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const supabase = createAdminClient()
  
  // Get the registration details before deleting to use them for cleaning up evo_registrations
  const { data: reg } = await supabase.from('registrations').select('school_name, contact_email').eq('id', id).single()

  const { error } = await supabase.from('registrations').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Also clean up evo_registrations to allow them to register again
  if (reg) {
    if (reg.contact_email && reg.contact_email.trim() !== '') {
      await supabase.from('evo_registrations').delete().eq('email', reg.contact_email)
    }
    if (reg.school_name && reg.school_name.trim() !== '') {
      await supabase.from('evo_registrations').delete().ilike('school_name', reg.school_name.trim())
    }
  }
  return NextResponse.json({ ok: true })
}

