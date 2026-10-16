import type { MergedErrorMap } from './error-utils'
import type { ProcedureContract } from './procedure'
import type { AugmentedContractRouter } from './router-utils'
import type { Schema } from './schema'
import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { oc } from './builder'

// Schemas should have distinct TInput and TOutput types to ensure correct inference.
const inputSchema = z.object({ input: z.number().transform(n => `${n}`) })
const outputSchema = z.object({ output: z.string().transform(s => Number(s)) })

const ping = oc.input(inputSchema).output(outputSchema)
const pong = oc.errors({ PONG: { message: 'pong' } })

const router = {
  ping,
  pong,
  nested: {
    ping,
    pong,
  },
}

const errorMap = {
  BASE: {
    message: 'base',
  },
}

describe('AugmentedContractRouter', () => {
  it('merges error maps', () => {
    type Augmented = AugmentedContractRouter<typeof router, typeof errorMap>

    expectTypeOf<Augmented['ping']>().toEqualTypeOf<
      ProcedureContract<
        typeof inputSchema,
        typeof outputSchema,
        MergedErrorMap<typeof errorMap, object>
      >
    >()

    expectTypeOf<Augmented['pong']>().toEqualTypeOf<
      ProcedureContract<
        Schema<void, unknown>,
        Schema<unknown, unknown>,
        MergedErrorMap<typeof errorMap, { PONG: { message: string } }>
      >
    >()
  })

  it('preserves nested structure', () => {
    type Augmented = AugmentedContractRouter<typeof router, typeof errorMap>

    expectTypeOf<Augmented['nested']['ping']>().toEqualTypeOf<
      ProcedureContract<
        typeof inputSchema,
        typeof outputSchema,
        MergedErrorMap<typeof errorMap, object>
      >
    >()

    expectTypeOf<Augmented['nested']['pong']>().toEqualTypeOf<
      ProcedureContract<
        Schema<void, unknown>,
        Schema<unknown, unknown>,
        MergedErrorMap<typeof errorMap, { PONG: { message: string } }>
      >
    >()
  })
})
