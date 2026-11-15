// Vercel Function: POST /api/device-events
// The Arduino sketch (hardware/uno_wifi_rev2) posts sensor events here over TLS with its own restricted
// device token. This forwards a bounded body to the Supabase `hardware` function, which authenticates the
// device itself. Server-only configuration: HARDWARE_FUNCTION_URL (never exposed to the browser).

const MAX_BYTES = 4096

function json(body: unknown, status: number) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

async function readBounded(request: Request): Promise<string | null> {
  const reader = request.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let length = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.byteLength
    if (length > MAX_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

export async function POST(request: Request) {
  const upstreamBase = process.env.HARDWARE_FUNCTION_URL
  if (!upstreamBase) return json({ detail: 'Hardware service is not configured.' }, 503)

  const body = await readBounded(request)
  if (body === null) return json({ detail: 'Payload too large' }, 413)

  try {
    const upstream = await fetch(upstreamBase.replace(/\/+$/, '') + '/device-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: request.headers.get('Authorization') ?? '' },
      body,
      signal: AbortSignal.timeout(15_000),
      redirect: 'error',
      cache: 'no-store',
    })
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  } catch {
    // Never log the device token or body.
    console.error('Hardware upstream connection failed')
    return json({ detail: 'Hardware service temporarily unavailable; retry the same event.' }, 503)
  }
}
