import { createProcedureClient, os, type } from '@orpc/server'
import { bench } from 'vitest'

const auth = os.middleware(async ({ next }) => {
  return next({ context: { userId: 'user-1' } })
})

const log = os.middleware(async ({ next }) => {
  return next()
})

const timing = os.middleware(async ({ next }) => {
  return next({ context: { startedAt: 0 } })
})

const plain = os.handler(({ input }) => input)

const validated = os
  .input(type<any>())
  .output(type<any>())
  .handler(({ input }) => input)

const middlewares = os
  .use(auth)
  .use(log)
  .use(timing)
  .handler(({ input }) => input)

const full = os
  .use(auth)
  .use(log)
  .use(timing)
  .input(type<any>())
  .output(type<any>())
  .handler(({ input }) => input)

const plainClient = createProcedureClient(plain)
const validatedClient = createProcedureClient(validated)
const middlewaresClient = createProcedureClient(middlewares)
const fullClient = createProcedureClient(full, {
  interceptors: [({ next }) => next()],
})

describe('procedure call', () => {
  const input = {
    id: 1,
    name: `1tem-${1}`,
    active: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    largeInt: 9007199254740993n + BigInt(1),
  }

  bench('plain', async () => {
    await plainClient(input as any)
  })

  bench('validated', async () => {
    await validatedClient(input)
  })

  bench('middlewares', async () => {
    await middlewaresClient(input as any)
  })

  bench('full (middlewares + validated + interceptors)', async () => {
    await fullClient(input)
  })
})
