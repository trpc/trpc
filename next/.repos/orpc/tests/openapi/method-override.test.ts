import { openapi } from '@orpc/openapi'
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { os } from '@orpc/server'
import { MethodOverrideHandlerPlugin } from '@orpc/server/plugins'
import { z } from 'zod'

describe('methodOverrideHandlerPlugin with OpenAPIHandler', () => {
  const deleteHandler = vi.fn(({ input }) => input)
  const detailedHandler = vi.fn(({ input }) => ({ body: input }))

  const router = {
    delete: os
      .input(z.object({ id: z.string(), reason: z.string() }))
      .meta(openapi({
        method: 'DELETE',
        path: '/todos/{id}',
      }))
      .handler(deleteHandler),
    detailed: os
      .input(z.any())
      .meta(openapi({
        method: 'PUT',
        path: '/articles/{id}',
        inputStructure: 'detailed',
      }))
      .handler(detailedHandler),
  }

  const handler = new OpenAPIHandler(router, {
    plugins: [new MethodOverrideHandlerPlugin()],
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('routes a POST with ?method=DELETE to the DELETE procedure with clean input', async () => {
    const { matched, response } = await handler.handle(new Request('https://example.com/todos/1?method=DELETE', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ reason: 'done' }),
    }))

    expect(matched).toBe(true)
    expect(response!.status).toBe(200)
    expect(deleteHandler).toHaveBeenCalledOnce()
    expect(deleteHandler.mock.calls[0]![0].input).toEqual({ id: '1', reason: 'done' })
  })

  it('does not match a plain POST to a DELETE-only route', async () => {
    const { matched } = await handler.handle(new Request('https://example.com/todos/1', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ reason: 'done' }),
    }))

    expect(matched).toBe(false)
    expect(deleteHandler).not.toHaveBeenCalled()
  })

  it('does not leak the override param into detailed query input', async () => {
    const { matched, response } = await handler.handle(new Request('https://example.com/articles/1?method=PUT&tag=news', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ title: 'hello' }),
    }))

    expect(matched).toBe(true)
    expect(response!.status).toBe(200)
    expect(detailedHandler).toHaveBeenCalledOnce()
    expect(detailedHandler.mock.calls[0]![0].input).toEqual(expect.objectContaining({
      params: { id: '1' },
      query: { tag: 'news' },
      body: { title: 'hello' },
    }))
  })

  it('silently ignores a disallowed override value', async () => {
    const { matched } = await handler.handle(new Request('https://example.com/todos/1?method=FOO', {
      method: 'POST',
    }))

    expect(matched).toBe(false)
    expect(deleteHandler).not.toHaveBeenCalled()
  })
})
