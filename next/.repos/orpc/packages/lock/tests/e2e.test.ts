import type { Locker } from '../src'
import { os } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { promiseWithResolvers, sleep } from '@orpc/shared'
import { z } from 'zod'
import { lock } from '../src'
import { MemoryLocker } from '../src/adapters/memory'

it('works', async () => {
  let active = 0
  let maxActive = 0

  const router = {
    generate: os
      .$context<{ locker: Locker }>()
      .input(z.object({ id: z.string() }))
      .use(
        lock({
          locker: ({ context }) => context.locker,
          key: (_, input) => `report:${input.id}`,
          timeout: 100,
        }),
      )
      .handler(async ({ context }) => {
        active++
        maxActive = Math.max(maxActive, active)
        await sleep(20)
        active--

        return { waited: context['lock/waited'] }
      }),
  }

  const handler = new RPCHandler(router)
  const locker = new MemoryLocker()

  const request = (id: string) => new Request('https://example.com/generate', {
    method: 'POST',
    body: JSON.stringify({ json: { id } }),
    headers: {
      'Content-Type': 'application/json',
    },
  })

  const [first, second] = await Promise.all([
    handler.handle(request('1'), { context: { locker } }),
    handler.handle(request('1'), { context: { locker } }),
  ])

  expect(first.response?.status).toBe(200)
  expect(second.response?.status).toBe(200)
  await expect(first.response?.json()).resolves.toMatchObject({ json: { waited: false } })
  await expect(second.response?.json()).resolves.toMatchObject({ json: { waited: true } })
  expect(maxActive).toBe(1)

  const { promise: release, resolve } = promiseWithResolvers<void>()
  const holder = locker.lock('report:2', () => release)

  const { response } = await handler.handle(request('2'), { context: { locker } })

  expect(response?.status).toBe(409)
  await expect(response?.json()).resolves.toMatchObject({ json: { code: 'CONFLICT' } })

  resolve()
  await holder
})
