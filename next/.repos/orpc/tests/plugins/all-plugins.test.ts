import type { RetryLinkPluginContext } from '@orpc/client/plugins'
import type { OpenAPIDocument } from '@orpc/openapi'
import type { RouterClient } from '@orpc/server'
import type { RequestHeadersHandlerPluginContext, ResponseHeadersHandlerPluginContext } from '@orpc/server/plugins'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import {
  BatchLinkPlugin,
  DedupeLinkPlugin,
  RequestCompressionLinkPlugin,
  ResponseCompressionLinkPlugin,
  RetryAfterLinkPlugin,
  RetryLinkPlugin,
  TimeoutLinkPlugin,
} from '@orpc/client/plugins'
import { oc } from '@orpc/contract'
import { RequestValidationLinkPlugin, ResponseValidationLinkPlugin } from '@orpc/contract/plugins'
import { EvlogHandlerPlugin } from '@orpc/evlog'
import { HibernationHandlerPlugin } from '@orpc/hibernation'
import { SmartCoercionHandlerPlugin, SmartCoercionLinkPlugin } from '@orpc/json-schema'
import { BatchResponseCompressionHandlerPlugin, StaticFileHandlerPlugin, TmpFileUploadHandlerPlugin } from '@orpc/node'
import { OpenAPIReferenceHandlerPlugin } from '@orpc/openapi/plugins'
import { PinoHandlerPlugin } from '@orpc/pino'
import { RateLimitHandlerPlugin } from '@orpc/ratelimit'
import { implement } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import {
  BatchHandlerPlugin,
  CORSHandlerPlugin,
  GetMethodCsrfProtectionHandlerPlugin,
  MethodOverrideHandlerPlugin,
  RequestCompressionHandlerPlugin,
  RequestHeadersHandlerPlugin,
  RequestLimitHandlerPlugin,
  ResponseCompressionHandlerPlugin,
  ResponseHeadersHandlerPlugin,
  RethrowHandlerPlugin,
  TimeoutHandlerPlugin,
} from '@orpc/server/plugins'
import pino from 'pino'
import { z } from 'zod'

/**
 * Every handler and link plugin shipped by the monorepo, mounted on a single handler and a
 * single link, so a plugin that cannot coexist with the others - most often because their
 * `before`/`after` hints resolve into an order that breaks one of them - fails here.
 *
 * New plugins belong in `createHandlerPlugins` or `createLinkPlugins` below.
 */

interface TestContext extends RequestHeadersHandlerPluginContext, ResponseHeadersHandlerPluginContext {}

interface TestClientContext extends RetryLinkPluginContext {}

const contract = {
  ping: oc
    .input(z.object({ value: z.number() }))
    .output(z.object({ value: z.number() })),
}

const spec: OpenAPIDocument<'3.2.0'> = {
  openapi: '3.2.0',
  info: { title: 'All Plugins', version: '1.0.0' },
}

const implementer = implement(contract).$context<TestContext>()

const router = implementer.router({
  ping: implementer.ping.handler(({ input }) => input),
})

function createHandlerPlugins() {
  return [
    new BatchHandlerPlugin<TestContext>(),
    new BatchResponseCompressionHandlerPlugin<TestContext>({ threshold: 0 }),
    new CORSHandlerPlugin<TestContext>(),
    new EvlogHandlerPlugin<TestContext>(),
    new GetMethodCsrfProtectionHandlerPlugin<TestContext>(),
    new HibernationHandlerPlugin<TestContext>(),
    new MethodOverrideHandlerPlugin(),
    new OpenAPIReferenceHandlerPlugin<TestContext, 'scalar'>({ spec, docsPath: '/docs', specPath: '/spec.json' }),
    new PinoHandlerPlugin<TestContext>({ logger: pino({ level: 'silent' }) }),
    new RateLimitHandlerPlugin<TestContext>(),
    new RequestCompressionHandlerPlugin<TestContext>(),
    new RequestHeadersHandlerPlugin<TestContext>(),
    new RequestLimitHandlerPlugin<TestContext>({ maxBodySize: 10 * 1024 * 1024 }),
    new ResponseCompressionHandlerPlugin<TestContext>({ threshold: 0 }),
    new ResponseHeadersHandlerPlugin<TestContext>(),
    new RethrowHandlerPlugin<TestContext>({ filter: () => false }),
    new SmartCoercionHandlerPlugin(),
    new StaticFileHandlerPlugin<TestContext>({ rootDir: import.meta.dirname, path: '/static' }),
    new TimeoutHandlerPlugin<TestContext>({ timeout: 5000 }),
    new TmpFileUploadHandlerPlugin<TestContext>({
      maxBodySize: {
        memory: 10 * 1024 * 1024,
        file: 10 * 1024 * 1024,
        stream: 10 * 1024 * 1024,
      },
    }),
  ]
}

function createLinkPlugins() {
  return [
    new BatchLinkPlugin<TestClientContext>({ groups: [{ condition: () => true, context: {} }] }),
    new DedupeLinkPlugin<TestClientContext>({ groups: [{ condition: () => true, context: {} }] }),
    new RequestCompressionLinkPlugin<TestClientContext>({ threshold: 0 }),
    new RequestValidationLinkPlugin<TestClientContext>(contract),
    new ResponseCompressionLinkPlugin<TestClientContext>(),
    new ResponseValidationLinkPlugin<TestClientContext>(contract),
    new RetryAfterLinkPlugin<TestClientContext>(),
    new RetryLinkPlugin<TestClientContext>(),
    new SmartCoercionLinkPlugin<TestClientContext>(contract),
    new TimeoutLinkPlugin<TestClientContext>({ timeout: 5000 }),
  ]
}

function createClientServer() {
  const handler = new RPCHandler(router, {
    allowMethods: ['GET', 'POST', 'QUERY'], // batch requests and their sub-requests use any of them
    plugins: createHandlerPlugins(),
  })

  const exchanges: { request: Request, response: Response }[] = []

  const link = new RPCLink<TestClientContext>({
    url: '/rpc',
    origin: 'http://localhost',
    plugins: createLinkPlugins(),
    async fetch(url, init) {
      const request = new Request(url, init)

      const { response } = await handler.handle(request, {
        context: {},
        prefix: '/rpc',
      })

      const resolved = response ?? new Response('Not Found', { status: 404 })
      exchanges.push({ request, response: resolved })

      return resolved
    },
  })

  return {
    handler,
    exchanges,
    client: createORPCClient<RouterClient<typeof router, TestClientContext>>(link),
  }
}

describe('all plugins on one handler and one link', () => {
  it('batches concurrent calls through every plugin', async () => {
    const { client, exchanges } = createClientServer()

    await expect(Promise.all([
      client.ping({ value: 1 }),
      client.ping({ value: 2 }),
    ])).resolves.toEqual([
      { value: 1 },
      { value: 2 },
    ])

    expect(exchanges).toHaveLength(1) // both calls travelled in a single batch request
    expect(exchanges[0]!.request.headers.get('orpc-batch')).toEqual('streaming')
    // the batch request is compressed as a whole, and decompressed before it is split
    expect(exchanges[0]!.request.headers.get('content-encoding')).toEqual('gzip')
    // the batch response is compressed as a whole, and decompressed before it is decoded
    expect(exchanges[0]!.response.headers.get('content-encoding')).toEqual('gzip')
  })

  it('compresses a standalone call in both directions through every plugin', async () => {
    const { client, exchanges } = createClientServer()

    await expect(client.ping({ value: 1 })).resolves.toEqual({ value: 1 })

    expect(exchanges).toHaveLength(1)
    expect(exchanges[0]!.request.headers.get('content-encoding')).toEqual('gzip')
    expect(exchanges[0]!.response.headers.get('content-encoding')).toEqual('gzip')
  })

  it('serves the openapi reference behind the other routing plugins', async () => {
    const { handler } = createClientServer()

    const { response } = await handler.handle(new Request('http://localhost/rpc/spec.json'), {
      context: {},
      prefix: '/rpc',
    })

    expect(response?.status).toEqual(200)
    await expect(response?.json()).resolves.toEqual(spec)
  })
})
