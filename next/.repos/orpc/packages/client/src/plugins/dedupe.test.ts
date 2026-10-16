import type { StandardBody, StandardLazyResponse, StandardRequest } from '@standard-server/core'
import type { StandardLinkCodec, StandardLinkTransport } from '../adapters/standard'
import { AsyncLocalStorage } from 'node:async_hooks'
import { getEventListeners } from 'node:events'
import * as SharedExperimentalV2Module from '@orpc/shared'
import { AsyncIteratorClass, asyncIteratorToStream, promiseWithResolvers, sleep } from '@orpc/shared'
import { StandardLink } from '../adapters/standard'
import { DedupeLinkPlugin } from './dedupe'

interface TestContext {
  group?: boolean
  tag?: string
}

function makeCodec(): StandardLinkCodec<TestContext> {
  return {
    encodeInput: vi.fn(async (input, path, { signal }) => ({
      method: path[0] as StandardRequest['method'],
      url: `/${path.slice(1).join('/')}` as `/${string}`,
      headers: {
        authorization: 'bearer 123',
        path: path.join('/'),
      },
      body: input,
      signal,
    } satisfies StandardRequest)),
    decodeResponse: vi.fn(async (response) => {
      const body = await response.resolveBody()
      return { kind: 'output' as const, output: body }
    }),
  }
}

function makeTransport(
  resolveBody: StandardLazyResponse['resolveBody'] = vi.fn(async () => ({ value: '__body__' })),
): StandardLinkTransport<TestContext> {
  return {
    send: vi.fn(async () => ({
      status: 200,
      headers: {
        'x-custom': '1',
      },
      resolveBody,
    } satisfies StandardLazyResponse)),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('dedupeLinkPlugin', () => {
  const allAbortSignalSpy = vi.spyOn(SharedExperimentalV2Module, 'allAbortSignal')

  it('dedupes identical requests and reuses the resolved body', async () => {
    const signal1 = AbortSignal.timeout(1000)
    const signal2 = AbortSignal.timeout(1000)
    const codec = makeCodec()
    const resolveBody = vi.fn(async () => ({ value: '__body__' }))
    const transport = makeTransport(resolveBody)
    const groupCondition = vi.fn(() => true)

    const link = new StandardLink(codec, transport, {
      plugins: [new DedupeLinkPlugin({
        groups: [{
          condition: groupCondition,
          context: { group: true },
        }],
      })],
    })

    const [output1, output2] = await Promise.all([
      link.call(['GET', 'planet'], { value: 1 }, { context: { tag: 'first' }, signal: signal1 }),
      link.call(['GET', 'planet'], { value: 1 }, { context: { tag: 'second' }, signal: signal2 }),
    ])

    expect(output1).toEqual({ value: '__body__' })
    expect(output2).toEqual({ value: '__body__' })
    expect(output1).toBe(output2)

    expect(codec.encodeInput).toHaveBeenCalledTimes(2)
    expect(transport.send).toHaveBeenCalledTimes(1)
    expect(resolveBody).toHaveBeenCalledTimes(1)

    const [request, path, callOptions] = vi.mocked(transport.send).mock.calls[0]!

    expect(request).toEqual({
      ...await vi.mocked(codec.encodeInput).mock.results[0]!.value,
      signal: allAbortSignalSpy.mock.results[0]!.value,
    })
    expect(path).toEqual(['GET', 'planet'])
    expect(callOptions).toMatchObject({
      context: { group: true },
      signal: allAbortSignalSpy.mock.results[0]!.value,
    })
    expect((callOptions as any).next).toEqual(expect.any(Function))

    expect(allAbortSignalSpy).toHaveBeenCalledTimes(1)
    expect(allAbortSignalSpy).toHaveBeenCalledWith([signal1, signal2])

    expect(groupCondition).toHaveBeenCalledTimes(2)
    expect(groupCondition).toHaveBeenNthCalledWith(1, expect.objectContaining({
      path: ['GET', 'planet'],
      request: await vi.mocked(codec.encodeInput).mock.results[0]!.value,
      context: { tag: 'first' },
    }))
    expect(groupCondition).toHaveBeenNthCalledWith(2, expect.objectContaining({
      path: ['GET', 'planet'],
      request: await vi.mocked(codec.encodeInput).mock.results[1]!.value,
      context: { tag: 'second' },
    }))
  })

  it('dedupes identical QUERY requests by default', async () => {
    const codec = makeCodec()
    const transport = makeTransport()

    const link = new StandardLink(codec, transport, {
      plugins: [new DedupeLinkPlugin({
        groups: [{ condition: () => true, context: { group: true } }],
      })],
    })

    const [output1, output2] = await Promise.all([
      link.call(['QUERY', 'planet'], { value: 1 }, { context: {} }),
      link.call(['QUERY', 'planet'], { value: 1 }, { context: {} }),
    ])

    expect(output1).toBe(output2)
    expect(transport.send).toHaveBeenCalledTimes(1)
  })

  it('does not dedupe QUERY requests with different bodies', async () => {
    const codec = makeCodec()
    const transport = makeTransport()

    const link = new StandardLink(codec, transport, {
      plugins: [new DedupeLinkPlugin({
        groups: [{ condition: () => true, context: { group: true } }],
      })],
    })

    const [output1, output2] = await Promise.all([
      link.call(['QUERY', 'planet'], { value: 1 }, { context: {} }),
      link.call(['QUERY', 'planet'], { value: 2 }, { context: {} }),
    ])

    expect(output1).not.toBe(output2)
    expect(transport.send).toHaveBeenCalledTimes(2)
  })

  it('does not dedupe unsafe methods by default', async () => {
    const codec = makeCodec()
    const transport = makeTransport()

    const link = new StandardLink(codec, transport, {
      plugins: [new DedupeLinkPlugin({
        groups: [{ condition: () => true, context: { group: true } }],
      })],
    })

    const [output1, output2] = await Promise.all([
      link.call(['POST', 'planet'], { value: 1 }, { context: {} }),
      link.call(['POST', 'planet'], { value: 1 }, { context: {} }),
    ])

    expect(output1).not.toBe(output2)
    expect(transport.send).toHaveBeenCalledTimes(2)
  })

  it('computes group context from all deduped matching options', async () => {
    const codec = makeCodec()
    const transport = makeTransport()
    const context = vi.fn((items: [
      { context: TestContext },
      ...{ context: TestContext }[],
    ]) => ({
      group: true,
      tag: items.map(item => item.context.tag).join(','),
    }))

    const link = new StandardLink(codec, transport, {
      plugins: [new DedupeLinkPlugin({
        groups: [{
          condition: () => true,
          context,
        }],
      })],
    })

    await Promise.all([
      link.call(['GET', 'planet'], { value: 1 }, { context: { tag: 'first' } }),
      link.call(['GET', 'planet'], { value: 1 }, { context: { tag: 'second' } }),
    ])

    expect(context).toHaveBeenCalledTimes(1)
    expect(context).toHaveBeenCalledWith([
      expect.objectContaining({ context: { tag: 'first' } }),
      expect.objectContaining({ context: { tag: 'second' } }),
    ])

    const [, , callOptions] = vi.mocked(transport.send).mock.calls[0]!

    expect(callOptions).toMatchObject({
      context: { group: true, tag: 'first,second' },
    })
  })

  it('passes through single matching requests without applying dedupe context', async () => {
    const signal = AbortSignal.timeout(1000)
    const codec = makeCodec()
    const transport = makeTransport()
    const context = vi.fn(() => ({
      group: true,
      tag: 'deduped',
    }))

    const link = new StandardLink(codec, transport, {
      plugins: [new DedupeLinkPlugin({
        groups: [{
          condition: () => true,
          context,
        }],
      })],
    })

    await link.call(['GET', 'planet'], { value: 1 }, { context: { tag: 'single' }, signal })

    expect(context).not.toHaveBeenCalled()
    expect(transport.send).toHaveBeenCalledTimes(1)

    const [request, path, callOptions] = vi.mocked(transport.send).mock.calls[0]!

    expect(request).toEqual(await vi.mocked(codec.encodeInput).mock.results[0]!.value)
    expect(path).toEqual(['GET', 'planet'])
    expect(callOptions).toMatchObject({
      context: { tag: 'single' },
      signal,
    })
    expect((callOptions as any).next).toEqual(expect.any(Function))
  })

  it('replicates AsyncIteratorObject response bodies for deduped requests', async () => {
    const codec = makeCodec()
    const iteratorFactory = vi.fn(async function* () {
      yield 'first'
      yield 'second'
    })
    const resolveBody = vi.fn(async () => iteratorFactory())
    const transport = makeTransport(resolveBody)

    const link = new StandardLink(codec, transport, {
      plugins: [new DedupeLinkPlugin({
        groups: [{ condition: () => true, context: { group: true } }],
      })],
    })

    const [output1, output2] = await Promise.all([
      link.call(['GET', 'planet'], { value: 1 }, { context: {} }),
      link.call(['GET', 'planet'], { value: 1 }, { context: {} }),
    ])

    await expect(readAllAsync(output1 as AsyncIterable<string>)).resolves.toEqual(['first', 'second'])
    await expect(readAllAsync(output2 as AsyncIterable<string>)).resolves.toEqual(['first', 'second'])
    expect(resolveBody).toHaveBeenCalledTimes(1)
  })

  it('replicates readable stream response bodies for deduped requests', async () => {
    const codec = makeCodec()
    const resolveBody = vi.fn(async () => new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]))
        controller.enqueue(new Uint8Array([3, 4]))
        controller.close()
      },
    }))
    const transport = makeTransport(resolveBody)

    const link = new StandardLink(codec, transport, {
      plugins: [new DedupeLinkPlugin({
        groups: [{ condition: () => true, context: { group: true } }],
      })],
    })

    const [output1, output2] = await Promise.all([
      link.call(['GET', 'planet'], { value: 1 }, { context: {} }),
      link.call(['GET', 'planet'], { value: 1 }, { context: {} }),
    ])

    await expect(readAllStream(output1 as ReadableStream<Uint8Array>)).resolves.toEqual([
      new Uint8Array([1, 2]),
      new Uint8Array([3, 4]),
    ])
    await expect(readAllStream(output2 as ReadableStream<Uint8Array>)).resolves.toEqual([
      new Uint8Array([1, 2]),
      new Uint8Array([3, 4]),
    ])
    expect(resolveBody).toHaveBeenCalledTimes(1)
  })

  it.each([
    [
      'readable-stream',
      () => new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2]))
          controller.enqueue(new Uint8Array([3, 4]))
          controller.close()
        },
      }),
      (output: unknown) => readAllStream(output as ReadableStream<Uint8Array>),
      [new Uint8Array([1, 2]), new Uint8Array([3, 4])],
    ],
    [
      'async-iterator',
      async function* () {
        yield 'first'
        yield 'second'
      },
      (output: unknown) => readAllAsync(output as AsyncIterable<string>),
      ['first', 'second'],
    ],
  ])('reuses the resolved %s body for repeated and concurrent reads of the same replicated response', async (_name, createBody, readAll, expected) => {
    const codec: StandardLinkCodec<TestContext> = {
      ...makeCodec(),
      decodeResponse: vi.fn(async (response) => {
        const [firstBody, concurrentBody] = await Promise.all([
          response.resolveBody(),
          response.resolveBody(),
        ])
        const laterBody = await response.resolveBody()

        expect(concurrentBody).toBe(firstBody)
        expect(laterBody).toBe(firstBody)

        return {
          kind: 'output' as const,
          output: firstBody,
        }
      }),
    }
    const resolveBody = vi.fn(async () => createBody())
    const transport = makeTransport(resolveBody)

    const link = new StandardLink(codec, transport, {
      plugins: [new DedupeLinkPlugin({
        groups: [{ condition: () => true, context: { group: true } }],
      })],
    })

    const [output1, output2] = await Promise.all([
      link.call(['GET', 'planet'], { value: 1 }, { context: {} }),
      link.call(['GET', 'planet'], { value: 1 }, { context: {} }),
    ])

    await expect(readAll(output1)).resolves.toEqual(expected)
    await expect(readAll(output2)).resolves.toEqual(expected)
    expect(resolveBody).toHaveBeenCalledTimes(1)
  })

  it('dedupes non-GET requests when filter allows them', async () => {
    const codec = makeCodec()
    const transport = makeTransport()

    const link = new StandardLink(codec, transport, {
      plugins: [new DedupeLinkPlugin({
        groups: [{ condition: () => true, context: { group: true } }],
        filter: () => true,
      })],
    })

    const [output1, output2] = await Promise.all([
      link.call(['POST', 'planet'], { value: 1 }, { context: {} }),
      link.call(['POST', 'planet'], { value: 1 }, { context: {} }),
    ])

    expect(output1).toBe(output2)
    expect(transport.send).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['blob', new Blob(['test'])],
    ['form-data', new FormData()],
    ['url-search-params', new URLSearchParams('a=1')],
    ['readable-stream', new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1]))
        controller.close()
      },
    })],
    ['async-iterator', (async function* () { yield 'chunk' }())],
  ])('passes through unsupported %s bodies', async (_name, body) => {
    const codec = makeCodec()
    const transport = makeTransport()

    const link = new StandardLink(codec, transport, {
      plugins: [new DedupeLinkPlugin({
        groups: [{ condition: () => true, context: { group: true } }],
        filter: () => true,
      })],
    })

    await Promise.all([
      link.call(['POST', 'upload'], body, { context: {} }),
      link.call(['POST', 'upload'], body, { context: {} }),
    ])

    expect(transport.send).toHaveBeenCalledTimes(2)
  })

  it('passes through when the request is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    const codec = makeCodec()
    const transport = makeTransport()

    const link = new StandardLink(codec, transport, {
      plugins: [new DedupeLinkPlugin({
        groups: [{ condition: () => true, context: { group: true } }],
      })],
    })

    await Promise.all([
      link.call(['GET', 'planet'], { value: 1 }, { context: {}, signal: controller.signal }),
      link.call(['GET', 'planet'], { value: 1 }, { context: {}, signal: controller.signal }),
    ])

    expect(transport.send).toHaveBeenCalledTimes(2)
  })

  it('rejects all callers when the request fails', async () => {
    const codec = makeCodec()
    const transport = makeTransport()

    vi.mocked(transport.send).mockRejectedValue(new Error('FAIL'))

    const link = new StandardLink(codec, transport, {
      plugins: [new DedupeLinkPlugin({
        groups: [{ condition: () => true, context: { group: true } }],
      })],
    })

    const promise1 = link.call(['GET', 'planet'], { value: 1 }, { context: {} })
    const promise2 = link.call(['GET', 'planet'], { value: 1 }, { context: {} })

    await expect(promise1).rejects.toThrow('FAIL')
    await expect(promise2).rejects.toThrow('FAIL')
    expect(transport.send).toHaveBeenCalledTimes(1)
  })

  it('rejects only the aborted caller while the shared request continues for the rest', async () => {
    const controller = new AbortController()
    const codec = makeCodec()
    const { body, tick, isCancelled } = createTickingIterator()
    const transport = makeTransport()
    const release = promiseWithResolvers<void>()

    vi.mocked(transport.send).mockImplementation(async () => {
      await release.promise
      return { status: 200, headers: {}, resolveBody: async () => body }
    })

    const link = new StandardLink(codec, transport, {
      plugins: [new DedupeLinkPlugin({
        groups: [{ condition: () => true, context: { group: true } }],
      })],
    })

    const promise1 = link.call(['GET', 'planet'], { value: 1 }, { context: {}, signal: controller.signal })
    const promise2 = link.call(['GET', 'planet'], { value: 1 }, { context: {} })

    await vi.waitFor(() => expect(transport.send).toHaveBeenCalledTimes(1))

    controller.abort()
    await expect(promise1).rejects.toBe(controller.signal.reason)

    release.resolve()
    const iterator = await promise2 as AsyncIteratorObject<string>
    const next = iterator.next()
    tick()
    await expect(next).resolves.toEqual({ done: false, value: 'tick' })

    await iterator.return?.()
    expect(isCancelled()).toBe(true)
  })

  it('leaves callers aborted while queued out of the request', async () => {
    vi.useFakeTimers()

    const controller1 = new AbortController()
    const signal2 = AbortSignal.timeout(1000)
    const controller3 = new AbortController()
    const codec = makeCodec()
    const transport = makeTransport()
    const context = vi.fn(() => ({ group: true }))

    const link = new StandardLink(codec, transport, {
      plugins: [new DedupeLinkPlugin({
        wait: 100,
        groups: [{ condition: () => true, context }],
      })],
    })

    const promise1 = link.call(['GET', 'planet'], { value: 1 }, { context: { tag: 'first' }, signal: controller1.signal })
    const promise2 = link.call(['GET', 'planet'], { value: 1 }, { context: { tag: 'second' }, signal: signal2 })
    const promise3 = link.call(['GET', 'planet'], { value: 2 }, { context: {}, signal: controller3.signal })

    await vi.advanceTimersByTimeAsync(10)
    controller1.abort()
    controller3.abort()

    await expect(promise1).rejects.toBe(controller1.signal.reason)
    await expect(promise3).rejects.toBe(controller3.signal.reason)
    expect(transport.send).toHaveBeenCalledTimes(0)

    await vi.advanceTimersByTimeAsync(90)
    await expect(promise2).resolves.toEqual({ value: '__body__' })

    // The only remaining caller is sent on its own, and nothing is sent for the fully aborted request
    expect(transport.send).toHaveBeenCalledTimes(1)
    expect(context).not.toHaveBeenCalled()
    expect(vi.mocked(transport.send).mock.calls[0]![2]).toMatchObject({
      context: { tag: 'second' },
      signal: signal2,
    })
  })

  it('rejects a caller that aborts while the shared body resolves', async () => {
    const controller = new AbortController()
    const codec = makeCodec()
    const body = promiseWithResolvers<StandardBody>()
    const transport = makeTransport(() => body.promise)

    const link = new StandardLink(codec, transport, {
      plugins: [new DedupeLinkPlugin({
        groups: [{ condition: () => true, context: { group: true } }],
      })],
    })

    const promise1 = link.call(['GET', 'planet'], { value: 1 }, { context: {}, signal: controller.signal })
    const promise2 = link.call(['GET', 'planet'], { value: 1 }, { context: {} })

    await vi.waitFor(() => expect(codec.decodeResponse).toHaveBeenCalledTimes(2))

    controller.abort()
    body.resolve({ value: '__body__' })

    await expect(promise1).rejects.toBe(controller.signal.reason)
    await expect(promise2).resolves.toEqual({ value: '__body__' })
  })

  describe.each([
    ['async-iterator', createTickingIterator],
    ['readable-stream', createTickingStream],
  ])('with a shared %s body', (_name, createTickingBody) => {
    it('stops streaming to a caller that aborts mid-stream while the rest keep reading', async () => {
      const controller = new AbortController()
      const codec = makeCodec()
      const { body, tick, isCancelled } = createTickingBody()
      const transport = makeTransport(async () => body)

      const link = new StandardLink(codec, transport, {
        plugins: [new DedupeLinkPlugin({
          groups: [{ condition: () => true, context: { group: true } }],
        })],
      })

      const [reader1, reader2] = await Promise.all([
        link.call(['GET', 'planet'], { value: 1 }, { context: {}, signal: controller.signal }).then(openReader),
        link.call(['GET', 'planet'], { value: 1 }, { context: {} }).then(openReader),
      ])

      const read1 = reader1.read()
      const read2 = reader2.read()
      tick()
      await expect(read1).resolves.toEqual({ done: false, value: 'tick' })
      await expect(read2).resolves.toEqual({ done: false, value: 'tick' })

      const pending1 = reader1.read()
      const pending2 = reader2.read()
      // Let both reads reach their replicas before aborting
      await sleep(0)
      controller.abort()
      tick()
      await expect(pending1).rejects.toBe(controller.signal.reason)
      await expect(pending2).resolves.toEqual({ done: false, value: 'tick' })

      await reader2.cancel()
      expect(isCancelled()).toBe(true)
    })

    it('lets the rest cancel the shared source after a caller aborts and stops reading', async () => {
      const controller = new AbortController()
      const codec = makeCodec()
      const { body, tick, isCancelled } = createTickingBody()
      const transport = makeTransport(async () => body)

      const link = new StandardLink(codec, transport, {
        plugins: [new DedupeLinkPlugin({
          groups: [{ condition: () => true, context: { group: true } }],
        })],
      })

      // The first caller never reads, so its replica keeps what it receives
      const [, reader2] = await Promise.all([
        link.call(['GET', 'planet'], { value: 1 }, { context: {}, signal: controller.signal }).then(openReader),
        link.call(['GET', 'planet'], { value: 1 }, { context: {} }).then(openReader),
      ])

      const read2 = reader2.read()
      tick()
      await expect(read2).resolves.toEqual({ done: false, value: 'tick' })

      controller.abort()
      await reader2.cancel()
      expect(isCancelled()).toBe(true)
    })

    it('closes the replica of a caller that aborts while the shared body resolves', async () => {
      const controller = new AbortController()
      const codec = makeCodec()
      const { body, isCancelled } = createTickingBody()
      const resolvedBody = promiseWithResolvers<StandardBody>()
      const transport = makeTransport(() => resolvedBody.promise)

      const link = new StandardLink(codec, transport, {
        plugins: [new DedupeLinkPlugin({
          groups: [{ condition: () => true, context: { group: true } }],
        })],
      })

      const promise1 = link.call(['GET', 'planet'], { value: 1 }, { context: {}, signal: controller.signal })
      const promise2 = link.call(['GET', 'planet'], { value: 1 }, { context: {} })

      await vi.waitFor(() => expect(codec.decodeResponse).toHaveBeenCalledTimes(2))

      controller.abort()
      resolvedBody.resolve(body)

      await expect(promise1).rejects.toBe(controller.signal.reason)

      await openReader(await promise2).cancel()
      expect(isCancelled()).toBe(true)
    })

    it.each([
      ['ends', true],
      ['fails', new Error('FAIL')],
    ] as const)('removes the abort listener once the replica is cancelled or the body %s', async (_name, end) => {
      const controller1 = new AbortController()
      const controller2 = new AbortController()
      const codec = makeCodec()
      const { body, tick } = createTickingBody()
      const transport = makeTransport(async () => body)

      const link = new StandardLink(codec, transport, {
        plugins: [new DedupeLinkPlugin({
          groups: [{ condition: () => true, context: { group: true } }],
        })],
      })

      const [reader1, reader2] = await Promise.all([
        link.call(['GET', 'planet'], { value: 1 }, { context: {}, signal: controller1.signal }).then(openReader),
        link.call(['GET', 'planet'], { value: 1 }, { context: {}, signal: controller2.signal }).then(openReader),
      ])

      const listenerCount1 = getEventListeners(controller1.signal, 'abort').length
      const listenerCount2 = getEventListeners(controller2.signal, 'abort').length

      // A cancelled stream branch settles only once the other branch cancels or the source ends
      const cancel1 = reader1.cancel()
      await sleep(0)

      expect(getEventListeners(controller1.signal, 'abort')).toHaveLength(listenerCount1 - 1)
      expect(getEventListeners(controller2.signal, 'abort')).toHaveLength(listenerCount2)

      const read2 = reader2.read().catch(error => error)
      tick(end)
      await expect(read2).resolves.toEqual(end === true ? { done: true, value: undefined } : end)
      await cancel1

      expect(getEventListeners(controller2.signal, 'abort')).toHaveLength(listenerCount2 - 1)
    })

    it('swallows a failure to cancel the shared source when the last reader aborts', async () => {
      const controller = new AbortController()
      const codec = makeCodec()
      const cancelError = new Error('CANCEL_FAILED')
      const { body, isCancelled } = createTickingBody(cancelError)
      const transport = makeTransport(async () => body)

      const link = new StandardLink(codec, transport, {
        plugins: [new DedupeLinkPlugin({
          groups: [{ condition: () => true, context: { group: true } }],
        })],
      })

      const [reader1, reader2] = await Promise.all([
        link.call(['GET', 'planet'], { value: 1 }, { context: {}, signal: controller.signal }).then(openReader),
        link.call(['GET', 'planet'], { value: 1 }, { context: {} }).then(openReader),
      ])

      // A cancelled stream branch settles with the source's cancel result once the other branch cancels
      const cancel2 = reader2.cancel().catch(error => error)
      const read1 = reader1.read()
      await sleep(0)
      controller.abort()

      await expect(read1).rejects.toBe(controller.signal.reason)
      expect(isCancelled()).toBe(true)
      await cancel2
    })
  })

  it('does not dedupe when no group matches', async () => {
    const codec = makeCodec()
    const transport = makeTransport()

    const link = new StandardLink(codec, transport, {
      plugins: [new DedupeLinkPlugin({
        groups: [{ condition: () => false, context: { group: true } }],
      })],
    })

    const [output1, output2] = await Promise.all([
      link.call(['GET', 'planet'], { value: 1 }, { context: {} }),
      link.call(['GET', 'planet'], { value: 1 }, { context: {} }),
    ])

    expect(output1).not.toBe(output2)
    expect(transport.send).toHaveBeenCalledTimes(2)
  })

  it('dedupes identical requests made within `wait`, counted from the first queued request', async () => {
    vi.useFakeTimers()

    const codec = makeCodec()
    const transport = makeTransport()

    const link = new StandardLink(codec, transport, {
      plugins: [new DedupeLinkPlugin({
        wait: 100,
        groups: [{ condition: () => true, context: {} }],
      })],
    })

    const promise1 = link.call(['GET', 'planet'], { value: 1 }, { context: {} })
    await vi.advanceTimersByTimeAsync(60)
    const promise2 = link.call(['GET', 'planet'], { value: 1 }, { context: {} })

    await vi.advanceTimersByTimeAsync(39)
    expect(transport.send).toHaveBeenCalledTimes(0)

    await vi.advanceTimersByTimeAsync(1)
    await expect(promise1).resolves.toEqual({ value: '__body__' })
    await expect(promise2).resolves.toEqual({ value: '__body__' })
    expect(transport.send).toHaveBeenCalledTimes(1)

    // A request made after the deduped one is sent starts a new wait
    const promise3 = link.call(['GET', 'planet'], { value: 1 }, { context: {} })

    await vi.advanceTimersByTimeAsync(99)
    expect(transport.send).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    await expect(promise3).resolves.toEqual({ value: '__body__' })
    expect(transport.send).toHaveBeenCalledTimes(2)
  })

  describe('async context', () => {
    const storage = new AsyncLocalStorage<string>()

    function makeUserTransport(): StandardLinkTransport<TestContext> {
      return {
        send: vi.fn(async () => {
          const user = storage.getStore()
          return { status: 200, headers: {}, resolveBody: async () => user }
        }),
      }
    }

    it('sends each request in its first caller\'s async context', async () => {
      const transport = makeUserTransport()
      const link = new StandardLink(makeCodec(), transport, {
        plugins: [new DedupeLinkPlugin({ groups: [{ condition: () => true, context: {} }] })],
      })

      await expect(Promise.all([
        storage.run('alice', () => link.call(['GET', 'a'], {}, { context: {} })),
        storage.run('bob', () => link.call(['GET', 'b'], {}, { context: {} })),
        storage.run('carol', () => link.call(['GET', 'b'], {}, { context: {} })),
      ])).resolves.toEqual(['alice', 'bob', 'bob'])

      expect(transport.send).toHaveBeenCalledTimes(2)
    })

    it('sends in the async context of the first caller that is not aborted', async () => {
      vi.useFakeTimers()

      const controller = new AbortController()
      const transport = makeUserTransport()
      const link = new StandardLink(makeCodec(), transport, {
        plugins: [new DedupeLinkPlugin({ wait: 100, groups: [{ condition: () => true, context: {} }] })],
      })

      const alice = storage.run('alice', () => link.call(['GET', 'me'], {}, { context: {}, signal: controller.signal }))
      const bob = storage.run('bob', () => link.call(['GET', 'me'], {}, { context: {} }))

      await vi.advanceTimersByTimeAsync(10)
      controller.abort()
      await expect(alice).rejects.toBe(controller.signal.reason)

      await vi.advanceTimersByTimeAsync(90)
      await expect(bob).resolves.toBe('bob')
      expect(transport.send).toHaveBeenCalledTimes(1)
    })

    it('dedupes only requests with the same scope', async () => {
      const transport = makeUserTransport()
      const link = new StandardLink(makeCodec(), transport, {
        plugins: [new DedupeLinkPlugin({
          groups: [{ condition: () => true, context: {} }],
          scope: () => storage.getStore(),
        })],
      })

      await expect(Promise.all(['alice', 'bob', 'alice', 'bob'].map(user =>
        storage.run(user, () => link.call(['GET', 'me'], {}, { context: {} })),
      ))).resolves.toEqual(['alice', 'bob', 'alice', 'bob'])

      expect(transport.send).toHaveBeenCalledTimes(2)
    })
  })
})

interface TickingBody<TBody> {
  body: TBody
  /**
   * Emits the next `'tick'`, or ends the body with `true`, or fails it with an error.
   */
  tick: (end?: true | Error) => void
  isCancelled: () => boolean
}

function createTickingIterator(cancelError?: Error): TickingBody<AsyncIteratorClass<string, void>> {
  let cancelled = false
  let ticks = promiseWithResolvers<true | Error | undefined>()

  const body = new AsyncIteratorClass<string, void>(async () => {
    const end = await ticks.promise
    ticks = promiseWithResolvers()

    if (end instanceof Error) {
      throw end
    }

    return end ? { done: true, value: undefined } : { done: false, value: 'tick' }
  }, async ({ kind }) => {
    cancelled ||= kind === 'cancelled'

    if (cancelled && cancelError) {
      throw cancelError
    }
  })

  return { body, tick: end => ticks.resolve(end), isCancelled: () => cancelled }
}

function createTickingStream(cancelError?: Error): TickingBody<ReadableStream<string>> {
  const { body, ...ticking } = createTickingIterator(cancelError)
  return { body: asyncIteratorToStream(body), ...ticking }
}

function openReader(output: unknown): { read: () => Promise<unknown>, cancel: () => Promise<void> } {
  if (output instanceof ReadableStream) {
    const reader = output.getReader()
    return { read: () => reader.read(), cancel: () => reader.cancel() }
  }

  const iterator = output as AsyncIteratorObject<unknown>
  return { read: () => iterator.next(), cancel: async () => void await iterator.return?.() }
}

async function readAllAsync<T>(iterator: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = []

  for await (const value of iterator) {
    values.push(value)
  }

  return values
}

async function readAllStream<T>(stream: ReadableStream<T>): Promise<T[]> {
  const reader = stream.getReader()
  const values: T[] = []

  try {
    while (true) {
      const result = await reader.read()

      if (result.done) {
        return values
      }

      values.push(result.value)
    }
  }
  finally {
    reader.releaseLock()
  }
}
