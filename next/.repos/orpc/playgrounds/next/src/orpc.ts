import { os } from '@orpc/server'
import type { Publisher } from '@orpc/publisher'
import { openapi } from '@orpc/openapi'

export interface ServerContext {
  messagePublisher: Publisher<Record<string, { message: string }>>
}

export const publicOS = os.$context<ServerContext>().use(async ({ next }) => {
  // Simulates network latency in development so loading states are visible. No-op in production.
  if (process.env.NODE_ENV === 'development') {
    await new Promise(r => setTimeout(r, 200))
  }

  return next()
})

export const protectedOS = publicOS
  .meta(openapi({
    spec: current => ({
      ...current,
      security: [{ bearerAuth: [] }],
    }),
  }))
  .use(({ next }) => {
  // Implement your own authentication check here
    return next({ context: { user: { id: 'dinwwwh' } } })
  })
