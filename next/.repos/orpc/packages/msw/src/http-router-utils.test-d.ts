import type { HTTPProcedureUtils } from './http-procedure-utils'
import type { HTTPRouterUtils } from './http-router-utils'
import { oc } from '@orpc/contract'
import { os } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import z from 'zod'
import { createHTTPUtils } from './http-router-utils'

const inputSchema = z.object({ input: z.number().transform(n => `${n}`) })
const outputSchema = z.object({ output: z.number().transform(n => `${n}`) })

const contract = {
  ping: oc.input(inputSchema).output(outputSchema),
  nested: {
    pong: oc,
  },
}

it('mirrors the router-contract shape', () => {
  const utils = createHTTPUtils(contract, { handler: router => new RPCHandler(router) })

  expectTypeOf(utils).toEqualTypeOf<HTTPRouterUtils<typeof contract, object>>()
  expectTypeOf(utils.ping).toExtend<HTTPProcedureUtils<object, typeof inputSchema, typeof outputSchema, object>>()
  expectTypeOf(utils.nested.pong).toExtend<{ loading: () => unknown }>()

  // @ts-expect-error --- not a procedure
  expectTypeOf(utils.nested.handler)
})

it('supports implemented routers', () => {
  const router = {
    ping: os
      .input(inputSchema)
      .output(outputSchema)
      .handler(({ input }) => ({ output: Number(input.input) })),
  }

  const utils = createHTTPUtils(router, { handler: router => new RPCHandler(router) })

  utils.ping.handler(({ input }) => {
    expectTypeOf(input).toEqualTypeOf<{ input: string }>()

    return { output: 123 }
  })

  // @ts-expect-error --- output must match the output schema input type
  utils.ping.handler(() => ({ output: '123' }))
})
