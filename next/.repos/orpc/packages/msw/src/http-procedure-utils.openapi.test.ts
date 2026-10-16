import type { RouterContractClient } from '@orpc/contract'
import type { JsonifiedClient } from '@orpc/openapi'
import { createORPCClient, isDefinedError, ORPCError } from '@orpc/client'
import { oc } from '@orpc/contract'
import { openapi } from '@orpc/openapi'
import { OpenAPIHandler, OpenAPILink } from '@orpc/openapi/fetch'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import z from 'zod'
import { createHTTPUtils } from './index'

const contract = {
  planet: {
    find: oc
      .meta(openapi({ method: 'GET', path: '/planets/{id}' }))
      .errors({ NOT_FOUND: { message: 'Planet not found', data: z.object({ id: z.number() }) } })
      .input(z.object({ id: z.coerce.number() }))
      .output(z.object({ id: z.number(), name: z.string() })),
    list: oc
      .meta(openapi({ method: 'GET', prefix: '/v1', path: '/planets' }))
      .output(z.array(z.object({ id: z.number(), name: z.string() }))),
    create: oc
      .input(z.object({ name: z.string() }))
      .output(z.object({ id: z.number(), name: z.string() })),
  },
  file: oc
    .meta(openapi({ method: 'GET', path: '/files/{+path}' }))
    .input(z.object({ path: z.string() }))
    .output(z.string()),
}

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const mock = createHTTPUtils(contract, {
  origin: 'http://localhost:3000',
  prefix: '/api',
  handler: router => new OpenAPIHandler(router),
})

const client: JsonifiedClient<RouterContractClient<typeof contract>> = createORPCClient(new OpenAPILink(contract, {
  origin: 'http://localhost:3000',
  url: '/api',
}))

it('mocks custom routes with path parameters', async () => {
  const fn = vi.fn(({ input }: { input: { id: number } }) => ({ id: input.id, name: 'Earth' }))

  server.use(mock.planet.find.handler(fn))

  await expect(client.planet.find({ id: 42 })).resolves.toEqual({ id: 42, name: 'Earth' })

  const options = fn.mock.calls[0]![0] as any
  expect(options.input).toEqual({ id: 42 })
})

it('mocks routes with a prefix', async () => {
  server.use(mock.planet.list.handler(() => [{ id: 1, name: 'Mars' }]))

  await expect(client.planet.list()).resolves.toEqual([{ id: 1, name: 'Mars' }])
})

it('mocks default routes', async () => {
  server.use(mock.planet.create.handler(({ input }) => ({ id: 7, name: input.name })))

  await expect(client.planet.create({ name: 'Venus' })).resolves.toEqual({ id: 7, name: 'Venus' })
})

it('mocks routes with greedy path parameters', async () => {
  server.use(mock.file.handler(({ input }) => input.path))

  await expect(client.file({ path: 'images/planets/earth.png' })).resolves.toBe('images/planets/earth.png')
})

it('responds with defined errors', async () => {
  server.use(mock.planet.find.error('NOT_FOUND', { data: { id: 42 } }))

  try {
    await client.planet.find({ id: 42 })
    expect.unreachable()
  }
  catch (error) {
    expect(error).toBeInstanceOf(ORPCError)
    expect(isDefinedError(error)).toBe(true)
    expect((error as any).code).toBe('NOT_FOUND')
    expect((error as any).message).toBe('Planet not found')
    expect((error as any).data).toEqual({ id: 42 })
  }
})

it('supports wildcard base urls', async () => {
  const wildcardMock = createHTTPUtils(contract, {
    origin: '*',
    prefix: '/api',
    handler: router => new OpenAPIHandler(router),
  })

  server.use(wildcardMock.planet.create.handler(({ input }) => ({ id: 1, name: input.name })))

  const wildcardClient: JsonifiedClient<RouterContractClient<typeof contract>> = createORPCClient(new OpenAPILink(contract, {
    origin: 'http://example.com',
    url: '/api',
  }))

  await expect(wildcardClient.planet.create({ name: 'Pluto' })).resolves.toEqual({ id: 1, name: 'Pluto' })
})

it('leaves requests with unmatched methods to other msw handlers', async () => {
  server.use(
    mock.planet.find.handler(({ input }) => ({ id: input.id, name: 'Earth' })),
    http.all('http://localhost:3000/*', async ({ request }) => HttpResponse.text(`fallback: ${await request.text()}`)),
  )

  // the find route only accepts GET, so a POST should fall through
  // with its body untouched, since matching never reads the body
  const response = await fetch('http://localhost:3000/api/planets/42', { method: 'POST', body: 'raw-body' })

  await expect(response.text()).resolves.toBe('fallback: raw-body')
})
