import type { RouterClient } from '@orpc/server'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { asyncIteratorObject, os } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { QueryClient } from '@tanstack/react-query'
import z from 'zod'
import { createTanstackQueryUtils } from '../../src'

export const router = {
  static: os
    .errors({ STATIC_ERROR: { data: z.object({ static: z.string() }) } })
    .input(z.object({ input: z.number() }))
    .output(z.object({ output: z.string() }))
    .handler(vi.fn(({ input }) => ({ output: input.input.toString() }))),
  stream: os
    .errors({ STREAM_ERROR: { data: z.object({ stream: z.string() }) } })
    .input(z.object({ input: z.number() }).optional())
    .output(asyncIteratorObject(z.object({ output: z.string() })))
    .handler(vi.fn(async function* ({ input }) {
      for (let i = 0; i < (input?.input ?? 0); i++) {
        yield { output: i.toString() }
      }
    })),
}

const handler = new RPCHandler(router)

// prefer createORPCClient over createRouterClient for more close realistic
export const client: RouterClient<typeof router, { cache?: boolean }> = createORPCClient(new RPCLink({
  origin: 'http://localhost',
  fetch: async (url, init) => {
    const { response } = await handler.handle(new Request(url, init))
    return response ?? new Response('Not Found', { status: 404 })
  },
}))

export const orpc = createTanstackQueryUtils(client)

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
})
