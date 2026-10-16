import { expect, it } from 'vitest'

it('exports CloudflareRateLimiter, experimental_CloudflareTracer, DurablePublisher, DurablePublisherObject, experimental_DurableLocker, experimental_DurableLockObject', async () => {
  await expect(import('./index')).resolves.toMatchObject({
    CloudflareRateLimiter: expect.any(Function),
    experimental_CloudflareTracer: expect.any(Function),
    DurablePublisher: expect.any(Function),
    DurablePublisherObject: expect.any(Function),
    experimental_DurableLocker: expect.any(Function),
    experimental_DurableLockObject: expect.any(Function),
  })
})
