import type { ORPCError } from '@orpc/client'
import type { ThrowableError } from '@orpc/shared'
import type { InferRouterContractError, InferRouterContractErrorMap, InferRouterContractErrors, InferRouterContractInputs, InferRouterContractOutputs } from './router'
import { expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { oc } from './builder'

// Schemas should have distinct TInput and TOutput types to ensure correct inference.
const schema1 = z.object({ schema1: z.string().transform(n => Number(n)) })
const schema2 = z.object({ schema2: z.string().transform(n => Number(n)) })

const ping = oc
  .input(schema1)
  .output(schema2)

const pong = oc
  .errors({
    BAD_GATEWAY: {
      data: schema1,
    },
  })

const notFound = oc
  .errors({
    NOT_FOUND: {
      data: schema2,
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

const errorRouter = {
  pong,
  nested: {
    notFound,
  },
}

it('InferRouterContractInputs', () => {
  type Inputs = InferRouterContractInputs<typeof router>

  expectTypeOf<Inputs['ping']>().toEqualTypeOf<{ schema1: string }>()
  expectTypeOf<Inputs['pong']>().toEqualTypeOf<void>()

  expectTypeOf<Inputs['nested']['ping']>().toEqualTypeOf<{ schema1: string }>()
  expectTypeOf<Inputs['nested']['pong']>().toEqualTypeOf<void>()
})

it('InferRouterContractOutputs', () => {
  type Outputs = InferRouterContractOutputs<typeof router>

  expectTypeOf<Outputs['ping']>().toEqualTypeOf<{ schema2: number }>()
  expectTypeOf<Outputs['pong']>().toEqualTypeOf<unknown>()

  expectTypeOf<Outputs['nested']['ping']>().toEqualTypeOf<{ schema2: number }>()
  expectTypeOf<Outputs['nested']['pong']>().toEqualTypeOf<unknown>()
})

it('InferRouterContractErrorMap', () => {
  expectTypeOf<InferRouterContractErrorMap<typeof pong>>().toExtend<{
    BAD_GATEWAY: { data: typeof schema1 }
  }>()

  expectTypeOf<{
    BAD_GATEWAY: { data: typeof schema1 }
  }>().toExtend<InferRouterContractErrorMap<typeof router>>()
})

it('InferRouterContractErrors', () => {
  type Errors = InferRouterContractErrors<typeof errorRouter>

  expectTypeOf<Errors['pong']>().toEqualTypeOf<ORPCError<'BAD_GATEWAY', { schema1: number }> | ThrowableError>()
  expectTypeOf<Errors['nested']['notFound']>().toEqualTypeOf<ORPCError<'NOT_FOUND', { schema2: number }> | ThrowableError>()
})

it('InferRouterContractError', () => {
  expectTypeOf<InferRouterContractError<typeof errorRouter>>().toEqualTypeOf<
    | ORPCError<'BAD_GATEWAY', { schema1: number }>
    | ORPCError<'NOT_FOUND', { schema2: number }>
    | ThrowableError
  >()
})
