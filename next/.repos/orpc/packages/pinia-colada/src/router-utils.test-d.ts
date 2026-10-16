import type { ORPCErrorFromErrorMap } from '@orpc/contract'
import type { RouterClient } from '@orpc/server'
import type { Public } from '@orpc/shared'
import type { ProcedureUtils } from './procedure-utils'
import type { RouterUtils } from './router-utils'
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

const router = {
  ping,
  pong,
  nested: os.router({
    ping,
    pong,
  }),
}

it('RouterUtils', () => {
  const utils = {} as RouterUtils<RouterClient<typeof router, { batch?: boolean }>>

  expectTypeOf(utils).toExtend<Public<SharedUtils<unknown>>>()
  expectTypeOf(utils.nested).toExtend<Public<SharedUtils<unknown>>>()

  expectTypeOf(utils.ping).toExtend<Public<SharedUtils<{ input: number }>>>()
  expectTypeOf(utils.nested.ping).toExtend<Public<SharedUtils<{ input: number }>>>()

  expectTypeOf(utils.ping).toExtend<
    Public<ProcedureUtils<{ batch?: boolean }, { input: number }, { output: string }, ORPCErrorFromErrorMap<typeof baseErrorMap> | Error>>
  >()
  expectTypeOf(utils.nested.ping).toExtend<
    Public<ProcedureUtils<{ batch?: boolean }, { input: number }, { output: string }, ORPCErrorFromErrorMap<typeof baseErrorMap> | Error>>
  >()

  expectTypeOf(utils.pong).toExtend<
    Public<ProcedureUtils<{ batch?: boolean }, unknown, unknown, Error>>
  >()
  expectTypeOf(utils.nested.pong).toExtend<
    Public<ProcedureUtils<{ batch?: boolean }, unknown, unknown, Error>>
  >()
})

it('createRouterUtils', () => {
  const utils = createRouterUtils({} as RouterClient<typeof router, { batch?: boolean }>, {
    prefix: '__prefix__',
    queryInterceptors: [
      ({ next, context, path }) => {
        expectTypeOf(context.batch).toEqualTypeOf<boolean | undefined>()
        expectTypeOf(path).toEqualTypeOf<string[]>()

        return next()
      },
    ],
    mutationInterceptors: [
      ({ next, context }) => {
        expectTypeOf(context.batch).toEqualTypeOf<boolean | undefined>()

        return next()
      },
    ],
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
    plugins: [
      {
        name: 'test-plugin',
        init: options => options,
        initProcedureOptions: (path, options) => {
          expectTypeOf(path).toEqualTypeOf<string[]>()

          return options
        },
      },
    ],
  })

  expectTypeOf(utils).toEqualTypeOf<RouterUtils<RouterClient<typeof router, { batch?: boolean }>>>()
})
