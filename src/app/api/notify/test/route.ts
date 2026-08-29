import { NextRequest, NextResponse } from 'next/server'
import { notifyEmitter, type NotifyPayload } from '@/lib/notify-emitter'

/**
 * POST /api/notify/test
 * Development helper — fires a fake notification directly into the SSE stream.
 * Use from the browser console on the projector page:
 *
 *   fetch('/api/notify/test', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({ type: 'streak', schoolName: 'Royal College', count: 3 })
 *   })
 *
 * Supported body fields:
 *   type        'streak' | 'comeback'   (default: 'streak')
 *   schoolName  string                  (default: 'Royal College')
 *   memberName  string                  (default: 'Test Member')
 *   subject     string                  (default: 'biology')
 *   count       number                  (default: 3)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))

    const payload: NotifyPayload = {
      type:       body.type       ?? 'streak',
      schoolName: body.schoolName ?? 'Royal College',
      memberName: body.memberName ?? 'Test Member',
      subject:    body.subject    ?? 'biology',
      count:      body.count      ?? 3,
    }

    notifyEmitter.emit('notify', payload)

    return NextResponse.json({ ok: true, fired: payload })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
