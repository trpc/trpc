import type { Client, ClientContext, NestedClient, ORPCError, ThrowableError } from '@orpc/client'
import type { RouterContractClient } from './router-client'
import { z } from 'zod'
import { oc } from './builder'

// Schemas should have distinct TInput and TOutput types to ensure correct inference.
const ping = oc.input(z.object({ input: z.number().transform(n => `${n}`) }))
const pong = oc.output(z.object({ output: z.string().transform(s => Number(s)) })).errors({
  INTERNAL_SERVER_ERROR: {
    data: z.object({ id: z.string().transform(s => Number(s)) }),
  },
})

const router = {
  ping,
  pong,
  nested: {
    ping,
    pong,
  },
}

describe('RouterContractClient', () => {
  it('is a NestedClient', () => {
    expectTypeOf<RouterContractClient<typeof router, ClientContext>>().toExtend<NestedClient<ClientContext>>()
  })

  it('maps to ProcedureContractClient', () => {
    type ClientType = RouterContractClient<typeof router, { cache?: boolean }>

    expectTypeOf<ClientType['ping']>().toEqualTypeOf<
      Client<{ cache?: boolean }, { input: number }, unknown, ThrowableError>
    >()

    expectTypeOf<ClientType['pong']>().toEqualTypeOf<
      Client<
        { cache?: boolean },
        void,
        { output: number },
        ThrowableError | ORPCError<'INTERNAL_SERVER_ERROR', { id: number }>
      >
    >()

    expectTypeOf<ClientType['nested']['ping']>().toEqualTypeOf<
      ClientType['ping']
    >()

    expectTypeOf<ClientType['nested']['pong']>().toEqualTypeOf<
      ClientType['pong']
    >()
  })
})
