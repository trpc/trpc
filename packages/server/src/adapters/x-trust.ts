/**
 * X-Trust middleware for tRPC
 * Annotates context with human presence score via X-Trust header.
 * Zero KYC, zero PII. Doctrine AIR: annotate, never block.
 * OSS: github.com/htl-syterme/htl-core
 */

export interface XTrustContext {
  xTrust: {
    trusted: boolean
    score: number
    annotated: true
  }
}

function b64urlToBytes(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

async function verifyXTrust(
  token: string,
  secret: string
): Promise<{ sub: string; score: number; iat: number; exp: number } | null> {
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== 'v1') return null
  const [, payloadB64, sigB64] = parts
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      b64urlToBytes(sigB64),
      new TextEncoder().encode(payloadB64)
    )
    if (!ok) return null
    const payload = JSON.parse(
      new TextDecoder().decode(b64urlToBytes(payloadB64))
    )
    const now = Math.floor(Date.now() / 1000)
    if (now > payload.exp || now - payload.iat > 120) return null
    if (typeof payload.score !== 'number' || payload.score < 0 || payload.score > 1) return null
    return payload
  } catch {
    return null
  }
}

/**
 * Creates a tRPC middleware that validates the X-Trust header.
 * Usage:
 *   const t = initTRPC.context<XTrustContext>().create()
 *   const xTrustMiddleware = createXTrustMiddleware(t, process.env.HTL_SECRET!)
 *   const humanProcedure = t.procedure.use(xTrustMiddleware)
 */
export function createXTrustMiddleware<TContext extends XTrustContext>(
  t: { middleware: Function },
  secret: string,
  minScore = 0
) {
  return t.middleware(async ({ ctx, next, getRawInput }: any) => {
    const req = (ctx as any).req as Request | undefined
    const token = req?.headers?.get?.('x-trust') ?? ''
    const payload = token ? await verifyXTrust(token, secret) : null
    const score = payload?.score ?? 0
    const trusted = payload !== null && score >= minScore
    return next({
      ctx: {
        ...ctx,
        xTrust: { trusted, score, annotated: true as const },
      },
    })
  })
                         }
