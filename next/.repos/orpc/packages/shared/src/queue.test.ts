import { AbortError } from '@standard-server/shared'
import { AsyncIdQueue } from './queue'

describe('asyncIdQueue', () => {
  let queue: AsyncIdQueue<string>
  const queueId1 = '1'
  const queueId2 = '2'

  beforeEach(() => {
    queue = new AsyncIdQueue<string>()
  })

  it('should require queue to be opened before push', () => {
    expect(() => queue.push(queueId1, 'item1')).toThrow(
      new Error(`[AsyncIdQueue] Cannot access queue[${queueId1}] because it is not open or aborted.`),
    )
  })

  it('should require queue to be opened before pull', async () => {
    await expect(queue.pull(queueId1)).rejects.toThrow(
      new Error(`[AsyncIdQueue] Cannot access queue[${queueId1}] because it is not open or aborted.`),
    )
  })

  it('should push and pull items in FIFO order', async () => {
    queue.open(queueId1)
    queue.push(queueId1, 'item1')
    queue.push(queueId1, 'item2')

    expect(await queue.pull(queueId1)).toBe('item1')
    expect(await queue.pull(queueId1)).toBe('item2')
  })

  it('should handle pulls before pushes (async wait)', async () => {
    queue.open(queueId1)
    const pullPromise1 = queue.pull(queueId1)
    const pullPromise2 = queue.pull(queueId1)

    queue.push(queueId1, 'item1')
    expect(await pullPromise1).toBe('item1')

    queue.push(queueId1, 'item2')
    expect(await pullPromise2).toBe('item2')
  })

  it('should isolate items between different queue IDs', async () => {
    queue.open(queueId1)
    queue.open(queueId2)

    queue.push(queueId1, 'itemQ1')
    queue.push(queueId2, 'itemQ2')

    expect(await queue.pull(queueId1)).toBe('itemQ1')
    expect(await queue.pull(queueId2)).toBe('itemQ2')
  })

  it('should close a queue, preventing further pushes/pulls', async () => {
    queue.open(queueId1)
    queue.push(queueId1, 'item1')
    queue.close({ id: queueId1 })

    expect(queue.isOpen(queueId1)).toBe(false)
    expect(() => queue.push(queueId1, 'item2')).toThrow(
      new Error(`[AsyncIdQueue] Cannot access queue[${queueId1}] because it is not open or aborted.`),
    )
    await expect(queue.pull(queueId1)).rejects.toThrow(
      new Error(`[AsyncIdQueue] Cannot access queue[${queueId1}] because it is not open or aborted.`),
    )
  })

  it('should reject pending pulls when a queue is closed (default reason)', async () => {
    queue.open(queueId1)
    queue.open(queueId2)
    const pullPromise1 = queue.pull(queueId1)
    const pullPromise2 = queue.pull(queueId2)

    queue.close({ id: queueId1 })

    await expect(pullPromise1).rejects.toThrow(
      new AbortError(`[AsyncIdQueue] Queue[${queueId1}] was closed or aborted while waiting for pulling.`),
    )

    queue.close()

    await expect(pullPromise2).rejects.toThrow(
      new AbortError(`[AsyncIdQueue] Queue[${queueId2}] was closed or aborted while waiting for pulling.`),
    )
  })

  it('should reject pending pulls with a custom reason when a queue is closed', async () => {
    queue.open(queueId1)
    queue.open(queueId2)
    const pullPromise1 = queue.pull(queueId1)
    const pullPromise2 = queue.pull(queueId1)
    const customError = new Error('Custom closure reason')

    queue.close({ id: queueId1, reason: customError })

    await expect(pullPromise1).rejects.toBe(customError)

    queue.close({ reason: customError })

    await expect(pullPromise2).rejects.toBe(customError)
  })

  it('close, isOpen, size', async () => {
    expect(queue.isOpen('1')).toBe(false)

    queue.open('1')
    expect(queue.isOpen('1')).toBe(true)
    expect(queue.size).toBe(1)

    queue.open('2')
    expect(queue.isOpen('2')).toBe(true)
    expect(queue.size).toBe(2)

    queue.open('3')
    expect(queue.isOpen('3')).toBe(true)
    expect(queue.size).toBe(3)

    expect(queue.isOpen('1')).toBe(true)
    expect(queue.isOpen('2')).toBe(true)
    expect(queue.isOpen('3')).toBe(true)

    queue.close({ id: '1' })
    expect(queue.isOpen('1')).toBe(false)
    expect(queue.isOpen('2')).toBe(true)
    expect(queue.isOpen('3')).toBe(true)

    queue.close()

    expect(queue.isOpen('1')).toBe(false)
    expect(queue.isOpen('2')).toBe(false)
    expect(queue.isOpen('3')).toBe(false)
  })
})
