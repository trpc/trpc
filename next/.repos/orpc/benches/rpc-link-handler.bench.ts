import type { RouterClient } from '@orpc/server'
import { createORPCClient, RPCSerializer } from '@orpc/client'
import { RPCLinkCodec, StandardLink } from '@orpc/client/standard'
import { os, type } from '@orpc/server'
import { RPCHandlerCodec, StandardHandler } from '@orpc/server/standard'
import { bench } from 'vitest'
import { asSyncIteratorObject, drainBody, EVENTS_10KB, handlers, PAYLOAD_10KB } from './__shared__/payloads'

const serializer = new RPCSerializer({ handlers })

const router = {
  ping: os
    .input(type<any>())
    .output(type<any>())
    .handler(({ input }) => input),
}

const handler = new StandardHandler(new RPCHandlerCodec(router, { serializer }), {})

const link = new StandardLink(new RPCLinkCodec({ serializer }), {
  async send(request, path, options) {
    const { matched, response } = await handler.handle(
      { ...request, resolveBody: () => Promise.resolve(request.body) },
      options,
    )

    if (matched) {
      return { ...response, resolveBody: () => Promise.resolve(response.body) }
    }

    return { status: 404, headers: {}, resolveBody: () => Promise.resolve('Not Found') }
  },
})

const client: RouterClient<typeof router> = createORPCClient(link)

describe('rpc link + handler', () => {
  bench('buffered', async () => {
    await client.ping(PAYLOAD_10KB)
  })

  bench('event stream', async () => {
    await drainBody(
      await client.ping(asSyncIteratorObject(EVENTS_10KB)),
    )
  })
})
