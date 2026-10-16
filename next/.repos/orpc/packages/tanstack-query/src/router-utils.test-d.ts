import type { ORPCErrorFromErrorMap } from '@orpc/contract'
import type { RouterClient } from '@orpc/server'
import type { ProcedureUtils, ProcedureUtilsOptions } from './procedure-utils'
import type { RouterUtils, RouterUtilsScoped } from './router-utils'
import type { SharedUtils } from './shared-utils'
import { os } from '@orpc/server'
import z from 'zod'
import { createRouterUtils } from './router-utils'

const inputSchema = z.object({ input: z.number().transform(n => `${n}`) })
const outputSchema = z.object({ output: z.number().transform(n => `${n}`) })
const unknownSchema = z.unknown()

const baseErrorMap = {
  BASE: {
    data: outputSchema,
  },
  OVERRIDE: {},
}

const ping = os.input(inputSchema).output(outputSchema).errors(baseErrorMap).handler(() => ({ output: 1 }))
const pong = os.input(unknownSchema).output(unknownSchema).handler(() => 'pong')

const scopedRouter = {
  ping,
  pong,
  nested: os.router({
    ping,
    pong,
  }),
}

it('RouterUtils', () => {
  type G = RouterClient<typeof scopedRouter, { batch?: boolean }>['nested']['ping']
  const utils = {} as RouterUtils<RouterClient<typeof scopedRouter, { batch?: boolean }>>

  expectTypeOf(utils).toExtend<Omit<SharedUtils<unknown>, 'path'>>()
  expectTypeOf<typeof utils>().not.toExtend<
    ProcedureUtils<any, any, any, any>
  >()

  expectTypeOf(utils.nested).toExtend<Omit<SharedUtils<unknown>, 'path'>>()
  expectTypeOf<typeof utils.nested>().not.toExtend<
    ProcedureUtils<any, any, any, any>
  >()

  expectTypeOf(utils.ping).toExtend<Omit<SharedUtils<{ input: number }>, 'path'>>()
  expectTypeOf(utils.ping).toExtend<
    Omit<ProcedureUtils<{ batch?: boolean }, { input: number }, { output: string }, ORPCErrorFromErrorMap<typeof baseErrorMap> | Error>, 'path' | 'options'>
  >()

  expectTypeOf(utils.nested.ping).toExtend<Omit<SharedUtils<{ input: number }>, 'path'>>()
  expectTypeOf(utils.nested.ping).toExtend<
    Omit<ProcedureUtils<{ batch?: boolean }, { input: number }, { output: string }, ORPCErrorFromErrorMap<typeof baseErrorMap> | Error>, 'path' | 'options'>
  >()

  expectTypeOf(utils.pong).toExtend<
    Omit<ProcedureUtils<{ batch?: boolean }, unknown, unknown, Error>, 'path' | 'options'>
  >()
  expectTypeOf(utils.nested.pong).toExtend<
    Omit<ProcedureUtils<{ batch?: boolean }, unknown, unknown, Error>, 'path' | 'options'>
  >()
})

it('RouterUtilsScoped', () => {
  const utils = {} as RouterUtilsScoped<RouterClient<typeof scopedRouter, { batch?: boolean }>>

  expectTypeOf<typeof utils>().not.toExtend<
    undefined | ProcedureUtilsOptions<any, any, any, any>
  >()

  expectTypeOf<typeof utils.nested>().not.toExtend<
    undefined | ProcedureUtilsOptions<any, any, any, any>
  >()

  expectTypeOf(utils.ping).toExtend<
    undefined | ProcedureUtilsOptions<{ batch?: boolean }, { input: number }, { output: string }, ORPCErrorFromErrorMap<typeof baseErrorMap> | Error>
  >()

  expectTypeOf(utils.nested?.ping).toExtend<
    undefined | ProcedureUtilsOptions<{ batch?: boolean }, { input: number }, { output: string }, ORPCErrorFromErrorMap<typeof baseErrorMap> | Error>
  >()

  expectTypeOf(utils.pong).toExtend<
    undefined | ProcedureUtilsOptions<{ batch?: boolean }, unknown, unknown, Error>
  >()
  expectTypeOf(utils.nested?.pong).toExtend<
   undefined | ProcedureUtilsOptions<{ batch?: boolean }, unknown, unknown, Error>
  >()
})

it('createRouterUtils', () => {
  const utils = createRouterUtils({} as RouterClient<typeof scopedRouter, { batch?: boolean }>, {
    prefix: '__prefix__',
    scoped: {
      nested: {
        ping: {
          mutationOptions: {
            onSuccess: (output) => {
              expectTypeOf(output).toEqualTypeOf<{ output: string }>()
            },
          },
        },
      },
    },
  })

  expectTypeOf(utils).toEqualTypeOf<RouterUtils<RouterClient<typeof scopedRouter, { batch?: boolean }>>>()
})
