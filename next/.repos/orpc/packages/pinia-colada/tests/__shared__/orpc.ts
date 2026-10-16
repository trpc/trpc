import type { RouterClient } from '@orpc/server'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { asyncIteratorObject, os } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { PiniaColada } from '@pinia/colada'
import { mount as baseMount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import z from 'zod'
import { createPiniaColadaUtils } from '../../src'

export const router = {
  ping: os
    .errors({ BASE: { data: z.object({ output: z.string() }) }, OVERRIDE: {} })
    .input(z.object({ input: z.number() }))
    .output(z.object({ output: z.string() }))
    .handler(vi.fn(({ input }) => ({ output: input.input.toString() }))),
  pong: os.handler(vi.fn(() => 'pong')),
  stream: os
    .errors({ OVERRIDE: {} })
    .input(z.object({ input: z.number() }).optional())
    .output(asyncIteratorObject(z.object({ output: z.string() })))
    .handler(vi.fn(async function* ({ input }) {
      for (let i = 0; i < (input?.input ?? 0); i++) {
        yield { output: i.toString() }
      }
    })),
  list: os
    .input(z.object({ cursor: z.number() }))
    .output(z.object({ items: z.array(z.string()), next: z.number().nullable() }))
    .handler(vi.fn(({ input }) => ({
      items: [`item-${input.cursor}`],
      next: input.cursor < 2 ? input.cursor + 1 : null,
    }))),
  nested: {
    ping: os
      .errors({ BASE: { data: z.object({ output: z.string() }) }, OVERRIDE: {} })
      .input(z.object({ input: z.number() }))
      .output(z.object({ output: z.string() }))
      .handler(vi.fn(({ input }) => ({ output: input.input.toString() }))),
    pong: os.handler(vi.fn(() => 'pong')),
  },
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

export const orpc = createPiniaColadaUtils(client)

export const mount: typeof baseMount = (component, options) => {
  return baseMount(component, {
    global: {
      plugins: [
        createPinia(),
        PiniaColada,
      ],
    },
    ...options,
  })
}
