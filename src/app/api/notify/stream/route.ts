import { notifyEmitter, type NotifyPayload } from '@/lib/notify-emitter'

export const dynamic = 'force-dynamic'

/**
 * GET /api/notify/stream
 * Server-Sent Events endpoint for real-time projector notifications.
 * The projector page connects once and receives 'notification' events
 * whenever a streak or comeback is detected in /api/submit-answer.
 */
export async function GET() {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      // Confirm connection immediately
      controller.enqueue(encoder.encode(': connected\n\n'))

      const onNotify = (payload: NotifyPayload) => {
        try {
          controller.enqueue(
            encoder.encode(`event: notification\ndata: ${JSON.stringify(payload)}\n\n`)
          )
        } catch {
          // client disconnected mid-write — ignore
        }
      }

      notifyEmitter.on('notify', onNotify)

      // Heartbeat every 20 s to keep proxies from killing idle connections
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'))
        } catch {
          clearInterval(heartbeat)
        }
      }, 20_000)

      return () => {
        clearInterval(heartbeat)
        notifyEmitter.off('notify', onNotify)
      }
    },
    cancel() {
      // browser closed connection — nothing to do, cleanup runs above
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
