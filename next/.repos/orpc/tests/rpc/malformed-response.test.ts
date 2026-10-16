import { createORPCClient, MalformedResponseError } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { os } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'

describe('malformed response', () => {
  const upstream = createORPCClient<any>(new RPCLink({
    origin: 'http://upstream.internal',
    fetch: async () => new Response('Bad Gateway', {
      status: 502,
      headers: { 'content-type': 'text/plain', 'set-cookie': 'lb_session=secret' },
    }),
  }))

  it('throws a MalformedResponseError carrying the response', async () => {
    const error: any = await upstream.ping().then(() => null, (e: unknown) => e)

    expect(error).toBeInstanceOf(MalformedResponseError)
    expect(error.message).toBe('Bad Gateway')
    expect(error.response).toEqual(expect.objectContaining({
      status: 502,
      headers: expect.objectContaining({ 'set-cookie': 'lb_session=secret' }),
    }))
  })

  it('does not forward the upstream response when rethrown from a handler', async () => {
    const handler = new RPCHandler({ ping: os.handler(() => upstream.ping()) })

    const { response } = await handler.handle(new Request('http://localhost/ping', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }))

    expect(response?.status).toBe(500)
    expect(response?.headers.has('set-cookie')).toBe(false)
    expect(await response?.json()).toEqual({
      json: { defined: false, code: 'INTERNAL_SERVER_ERROR', message: 'Internal Server Error' },
    })
  })
})
