import type { RateLimiter } from '../src'
import { os } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { z } from 'zod'
import { ratelimit, RateLimitHandlerPlugin } from '../src'
import { MemoryRateLimiter } from '../src/adapters/memory'

it('works', async () => {
  const router = {
    login: os
      .$context<{ limiter: RateLimiter }>()
      .input(z.object({ email: z.email() }))
      .use(
        ratelimit({
          limiter: ({ context }) => context.limiter,
          key: (_, input) => `ping:${input.email}`,
        }),
      )
      .handler(({ input }) => {
        return { success: true }
      }),
  }

  const handler = new RPCHandler(router, {
    plugins: [
      new RateLimitHandlerPlugin(),
    ],
  })

  const request = new Request('https://example.com/login', {
    method: 'POST',
    body: JSON.stringify({ json: { email: 'test@example.com' } }),
    headers: {
      'Content-Type': 'application/json',
    },
  })

  const limiter = new MemoryRateLimiter({
    maxRequests: 5,
    window: 1000,
  })

  for (let i = 0; i < 5; i++) {
    const { response } = await handler.handle(request.clone(), {
      context: {
        limiter,
      },
    })

    expect(response?.status).toBe(200)
    expect(response?.headers.get('RateLimit-Limit')).toBe('5')
    expect(response?.headers.get('RateLimit-Remaining')).toBe(String(4 - i))
    expect(response?.headers.get('RateLimit-Reset')).toBeTypeOf('string')
  }

  const { response } = await handler.handle(request.clone(), {
    context: {
      limiter,
    },
  })

  expect(response?.status).toBe(429)
  expect(response?.headers.get('RateLimit-Limit')).toBe('5')
  expect(response?.headers.get('RateLimit-Remaining')).toBe('0')
  expect(response?.headers.get('RateLimit-Reset')).toBeTypeOf('string')
  expect(response?.headers.get('Retry-After')).toBeTypeOf('string')
})
