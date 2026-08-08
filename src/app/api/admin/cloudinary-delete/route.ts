import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!
const API_KEY = process.env.CLOUDINARY_API_KEY!
const API_SECRET = process.env.CLOUDINARY_API_SECRET!

function checkAdminAuth(req: NextRequest): boolean {
  return req.headers.get('x-admin-token') === process.env.ADMIN_PASSWORD
}

// Extract public_id from a Cloudinary secure_url
// e.g. https://res.cloudinary.com/cloud/image/upload/v123/summons/questions/abc.jpg
// → summons/questions/abc
function extractPublicId(url: string): string | null {
  try {
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-z]{2,5})?$/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { imageUrl } = await req.json()
  if (!imageUrl) return NextResponse.json({ error: 'imageUrl required' }, { status: 400 })

  const publicId = extractPublicId(imageUrl)
  if (!publicId) return NextResponse.json({ error: 'Could not extract public_id from URL' }, { status: 400 })

  const timestamp = Math.floor(Date.now() / 1000)

  // Build signature: SHA1 of "public_id=...&timestamp=...{API_SECRET}"
  const signaturePayload = `public_id=${publicId}&timestamp=${timestamp}${API_SECRET}`
  const signature = crypto.createHash('sha1').update(signaturePayload).digest('hex')

  const formData = new URLSearchParams()
  formData.append('public_id', publicId)
  formData.append('timestamp', String(timestamp))
  formData.append('api_key', API_KEY)
  formData.append('signature', signature)

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/destroy`,
    { method: 'POST', body: formData }
  )

  const data = await res.json()

  if (data.result === 'ok') {
    return NextResponse.json({ ok: true })
  } else {
    // "not found" means it was already gone — treat as success
    if (data.result === 'not found') return NextResponse.json({ ok: true })
    return NextResponse.json({ error: data.result ?? 'Cloudinary delete failed' }, { status: 500 })
  }
}
