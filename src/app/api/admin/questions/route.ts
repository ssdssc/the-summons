import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

function checkAdminAuth(req: NextRequest): boolean {
  return req.headers.get('x-admin-token') === process.env.ADMIN_PASSWORD
}

// ── GET: List questions for a subject ──────────────────────
export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const subject = req.nextUrl.searchParams.get('subject')
  if (!subject) return NextResponse.json({ error: 'Subject required' }, { status: 400 })

  const supabase = createAdminClient()
  let { data: quiz } = await supabase.from('quizzes').select('id').eq('subject', subject).single()
  if (!quiz) {
    // Auto-create quiz row if missing — no SQL needed
    const subjectLabel = subject.charAt(0).toUpperCase() + subject.slice(1)
    const { data: created } = await supabase
      .from('quizzes')
      .insert({ subject, title: `${subjectLabel} Quiz — THE SUMMONS`, status: 'waiting', correct_points: 4, negative_points: 1 })
      .select('id')
      .single()
    await supabase.from('quiz_state').upsert({ subject, status: 'waiting', current_question_index: -1 })
    quiz = created
  }
  if (!quiz) return NextResponse.json({ questions: [] })

  const { data: questions } = await supabase
    .from('questions')
    .select('*')
    .eq('quiz_id', quiz.id)
    .order('order_index')

  return NextResponse.json({ questions: questions ?? [] })
}

// ── POST: Bulk upload or add a single question ─────────────
export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const supabase = createAdminClient()

  // Get or auto-create quiz for the subject
  let { data: quiz } = await supabase
    .from('quizzes')
    .select('id')
    .eq('subject', body.subject)
    .single()

  if (!quiz) {
    const subjectLabel = (body.subject as string).charAt(0).toUpperCase() + (body.subject as string).slice(1)
    const { data: created } = await supabase
      .from('quizzes')
      .insert({ subject: body.subject, title: `${subjectLabel} Quiz — THE SUMMONS`, status: 'waiting', correct_points: 4, negative_points: 1 })
      .select('id')
      .single()
    await supabase.from('quiz_state').upsert({ subject: body.subject, status: 'waiting', current_question_index: -1 })
    quiz = created
  }

  if (!quiz) return NextResponse.json({ error: 'Failed to create quiz for subject' }, { status: 500 })

  if (Array.isArray(body.questions)) {
    // Bulk insert — clear existing and re-insert
    await supabase.from('questions').delete().eq('quiz_id', quiz.id)
    const toInsert = body.questions.map((q: any, i: number) => ({
      quiz_id: quiz.id,
      order_index: i,
      question_text: q.question_text,
      option_a: q.option_a,
      option_b: q.option_b,
      option_c: q.option_c,
      option_d: q.option_d,
      option_e: q.option_e ?? null,
      correct_option: q.correct_option,
      points: q.points ?? 4,
      negative_points: q.negative_points ?? 1,
      time_seconds: q.time_seconds ?? 30,
      image_url: q.image_url ?? null,
      // Sinhala translations
      question_text_si: q.question_text_si ?? null,
      option_a_si: q.option_a_si ?? null,
      option_b_si: q.option_b_si ?? null,
      option_c_si: q.option_c_si ?? null,
      option_d_si: q.option_d_si ?? null,
      option_e_si: q.option_e_si ?? null,
    }))
    const { error } = await supabase.from('questions').insert(toInsert)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, count: toInsert.length })
  }

  // Single question add or edit
  if (body.id) {
    // Update existing question (preserves order_index)
    const { error } = await supabase.from('questions').update({
      question_text: body.question_text,
      option_a: body.option_a,
      option_b: body.option_b,
      option_c: body.option_c,
      option_d: body.option_d,
      option_e: body.option_e ?? null,
      correct_option: body.correct_option,
      points: body.points ?? 4,
      negative_points: body.negative_points ?? 1,
      time_seconds: body.time_seconds ?? 30,
      image_url: body.image_url ?? null,
      // Sinhala translations
      question_text_si: body.question_text_si ?? null,
      option_a_si: body.option_a_si ?? null,
      option_b_si: body.option_b_si ?? null,
      option_c_si: body.option_c_si ?? null,
      option_d_si: body.option_d_si ?? null,
      option_e_si: body.option_e_si ?? null,
    }).eq('id', body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // New question insert
  const { data: last } = await supabase
    .from('questions')
    .select('order_index')
    .eq('quiz_id', quiz.id)
    .order('order_index', { ascending: false })
    .limit(1)
    .single()

  const nextIndex = last ? last.order_index + 1 : 0
  const { error } = await supabase.from('questions').insert({
    quiz_id: quiz.id,
    order_index: nextIndex,
    question_text: body.question_text,
    option_a: body.option_a,
    option_b: body.option_b,
    option_c: body.option_c,
    option_d: body.option_d,
    option_e: body.option_e ?? null,
    correct_option: body.correct_option,
    points: body.points ?? 4,
    negative_points: body.negative_points ?? 1,
    time_seconds: body.time_seconds ?? 30,
    image_url: body.image_url ?? null,
    // Sinhala translations
    question_text_si: body.question_text_si ?? null,
    option_a_si: body.option_a_si ?? null,
    option_b_si: body.option_b_si ?? null,
    option_c_si: body.option_c_si ?? null,
    option_d_si: body.option_d_si ?? null,
    option_e_si: body.option_e_si ?? null,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// ── DELETE: Remove a question or clear all ───────────────────
export async function DELETE(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const questionId = req.nextUrl.searchParams.get('id')
  const subject = req.nextUrl.searchParams.get('subject')
  const supabase = createAdminClient()

  if (subject) {
    const { data: quiz } = await supabase.from('quizzes').select('id').eq('subject', subject).single()
    if (quiz) {
      await supabase.from('questions').delete().eq('quiz_id', quiz.id)
    }
    return NextResponse.json({ ok: true })
  }

  if (!questionId) return NextResponse.json({ error: 'Question ID or subject required' }, { status: 400 })

  await supabase.from('questions').delete().eq('id', questionId)
  return NextResponse.json({ ok: true })
}

// ── PATCH: Reorder questions ───────────────────────────────
export async function PATCH(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { orderedIds } = await req.json()
  const supabase = createAdminClient()

  for (let i = 0; i < orderedIds.length; i++) {
    await supabase.from('questions').update({ order_index: i }).eq('id', orderedIds[i])
  }

  return NextResponse.json({ ok: true })
}
