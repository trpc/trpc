import type { HttpHandler } from 'msw'
import { oc } from '@orpc/contract'
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { RPCHandler } from '@orpc/server/fetch'
import z from 'zod'
import { createHTTPUtils } from './http-router-utils'

const inputSchema = z.object({ input: z.number().transform(n => `${n}`) })
const outputSchema = z.object({ output: z.number().transform(n => `${n}`) })

const baseErrorMap = {
  BASE: { data: z.object({ id: z.number().transform(n => `${n}`) }) },
  SIMPLE: {},
}

const contract = {
  ping: oc.input(inputSchema).output(outputSchema).errors(baseErrorMap),
  nested: {
    pong: oc,
  },
}

const utils = createHTTPUtils(contract, { prefix: '/rpc', handler: router => new RPCHandler(router) })

it('handler', () => {
  const handler = utils.ping.handler(({ input, errors, context, signal, lastEventId }) => {
    expectTypeOf(input).toEqualTypeOf<{ input: string }>()
    expectTypeOf(context).toEqualTypeOf<object>()
    expectTypeOf(signal).toEqualTypeOf<AbortSignal | undefined>()
    expectTypeOf(lastEventId).toEqualTypeOf<string | undefined>()

    expectTypeOf(errors.BASE({ data: { id: 1 } }).code).toEqualTypeOf<'BASE'>()
    // @ts-expect-error --- BASE requires data
    errors.BASE()
    // @ts-expect-error --- invalid data
    errors.BASE({ data: { id: 'invalid' } })

    return { output: 123 }
  })

  expectTypeOf(handler).toEqualTypeOf<HttpHandler>()

  // can be async
  utils.ping.handler(async () => ({ output: 123 }))
  // can return a typed error instead of throwing
  utils.ping.handler(({ errors }) => errors.SIMPLE())
  // untyped output when the contract has no output schema
  utils.nested.pong.handler(() => 'anything')

  // @ts-expect-error --- output must match the output schema input type
  utils.ping.handler(() => ({ output: '123' }))
  // @ts-expect-error --- missing output
  utils.ping.handler(() => ({}))
})

it('error', () => {
  expectTypeOf(utils.ping.error('BASE', { data: { id: 1 } })).toEqualTypeOf<HttpHandler>()

  utils.ping.error('SIMPLE')
  utils.ping.error('SIMPLE', { message: 'custom message' })

  // @ts-expect-error --- BASE requires data
  utils.ping.error('BASE')
  // @ts-expect-error --- invalid data
  utils.ping.error('BASE', { data: { id: 'invalid' } })
  // @ts-expect-error --- code must be defined in the contract
  utils.ping.error('NOT_DEFINED')
})

it('loading', () => {
  expectTypeOf(utils.ping.loading).toEqualTypeOf<() => HttpHandler>()
})

it('context option', () => {
  const contextUtils = createHTTPUtils(contract, {
    context: () => ({ userId: '1' }),
    handler: router => new RPCHandler(router),
  })

  contextUtils.ping.handler(({ context }) => {
    expectTypeOf(context).toEqualTypeOf<{ userId: string }>()

    return { output: 123 }
  })

  // context defaults to `object` when it cannot be inferred
  utils.ping.handler(({ context }) => {
    expectTypeOf(context).toEqualTypeOf<object>()

    return { output: 123 }
  })

  // required when an empty object cannot satisfy it
  createHTTPUtils(contract, {
    context: (): { userId: string } => ({ userId: '1' }),
    handler: router => new RPCHandler(router),
  })

  // @ts-expect-error --- context is required
  createHTTPUtils<typeof contract, { userId: string }>(contract, {
    handler: router => new RPCHandler(router),
  })
})

it('passthrough', () => {
  expectTypeOf(utils.ping.passthrough).toEqualTypeOf<() => HttpHandler>()
})

it('options', () => {
  createHTTPUtils(contract, { handler: router => new RPCHandler(router) })
  createHTTPUtils(contract, { origin: '*', prefix: '/rpc', handler: router => new RPCHandler(router) })
  createHTTPUtils(contract, { origin: 'http://localhost:3000', prefix: '/api', handler: router => new OpenAPIHandler(router) })

  // @ts-expect-error --- handler is required
  createHTTPUtils(contract, { origin: '*' })
  // @ts-expect-error --- must return a fetch handler
  createHTTPUtils(contract, { handler: () => ({}) })
  // @ts-expect-error --- prefix must start with /
  createHTTPUtils(contract, { prefix: 'rpc', handler: router => new RPCHandler(router) })
})
