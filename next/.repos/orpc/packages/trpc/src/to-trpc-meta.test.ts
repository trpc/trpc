import type { Meta } from '@orpc/server'
import { getOpenAPIMeta, openapi } from '@orpc/openapi'
import { defineMeta } from '@orpc/server'
import { initTRPC } from '@trpc/server'
import { toORPCRouter } from './to-orpc-router'
import { toTRPCMeta } from './to-trpc-meta'

describe('toTRPCMeta', () => {
  it('resolves meta plugins into a plain meta object', () => {
    expect(toTRPCMeta()).toEqual({})
    expect(toTRPCMeta(openapi({ path: '/hello', summary: 'Hello procedure' }))).toEqual({
      '~openapi': { path: '/hello', summary: 'Hello procedure' },
    })
  })

  it('applies plugin merge logic within a single call', () => {
    expect(toTRPCMeta(
      openapi({ method: 'GET', tags: ['a'] }),
      openapi({ path: '/hello', tags: ['b'] }),
    )).toEqual({
      '~openapi': { method: 'GET', path: '/hello', tags: ['a', 'b'] },
    })
  })

  it('supports custom defineMeta plugins', () => {
    const [authMeta, getAuthMeta] = defineMeta(
      'auth',
      (incoming: { required?: boolean }, current) => ({ ...current, ...incoming }),
    )

    const meta = toTRPCMeta(authMeta({ required: true }), openapi({ path: '/hello' }))

    expect(meta).toEqual({
      'auth': { required: true },
      '~openapi': { path: '/hello' },
    })
    expect(getAuthMeta({ '~orpc': { meta } })).toEqual({ required: true })
  })

  it('works end-to-end with tRPC builders and toORPCRouter', async () => {
    const t = initTRPC.meta<Meta>().create()

    const trpcRouter = t.router({
      ping: t.procedure
        .meta({
          ...toTRPCMeta(
            openapi({ path: '/ping', summary: 'Ping procedure' }),
            openapi.prefix('/api'),
          ),
          custom: 'value',
        })
        .query(() => 'pong'),
    })

    const orpcRouter = toORPCRouter(trpcRouter)

    expect(orpcRouter.ping['~orpc'].meta).toEqual({
      '~openapi': { path: '/ping', summary: 'Ping procedure', prefix: '/api' },
      'custom': 'value',
    })
    expect(getOpenAPIMeta(orpcRouter.ping)).toEqual({ path: '/ping', summary: 'Ping procedure', prefix: '/api' })
  })
})
