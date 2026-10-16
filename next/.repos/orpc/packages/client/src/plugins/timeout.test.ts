import type { StandardLazyResponse, StandardRequest } from '@standard-server/core'
import type { StandardLinkCodec, StandardLinkTransport } from '../adapters/standard'
import { AbortError } from '@orpc/shared'
import { StandardLink } from '../adapters/standard'
import { TimeoutLinkPlugin } from './timeout'

function makeCodec(): StandardLinkCodec<any> {
  return {
    encodeInput: vi.fn(async () => ({
      method: 'POST',
      url: '/test',
      headers: {},
      body: undefined,
    } satisfies StandardRequest)),
    decodeResponse: vi.fn(async response => ({
      kind: 'output' as const,
      output: await response.resolveBody(),
    })),
  }
}

function makeTransport(): StandardLinkTransport<any> {
  return {
    send: vi.fn(async () => ({
      status: 200,
      headers: {},
      resolveBody: async () => 'success',
    } satisfies StandardLazyResponse)),
  }
}

function makeAbortableTransport(): StandardLinkTransport<any> {
  return {
    send: vi.fn((request, path, options) => new Promise<StandardLazyResponse>((_, reject) => {
      options.signal?.addEventListener('abort', () => reject(options.signal!.reason), { once: true })
    })),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  expect(vi.getTimerCount()).toBe(0)
  vi.useRealTimers()
})

describe('timeoutLinkPlugin', () => {
  it('should complete request and clear the timeout when response arrives in time', async () => {
    const codec = makeCodec()
    const transport = makeTransport()

    const link = new StandardLink(codec, transport, {
      plugins: [new TimeoutLinkPlugin({ timeout: 5000 })],
    })

    expect(await link.call(['test'], 'input', { context: {} })).toBe('success')

    expect(transport.send).toHaveBeenCalledTimes(1)
    const signal = vi.mocked(transport.send).mock.calls[0]![2].signal
    expect(signal).toBeInstanceOf(AbortSignal)
    expect(signal!.aborted).toBe(false)
  })

  it('should abort with AbortError when timeout is exceeded', async () => {
    const codec = makeCodec()
    const transport = makeAbortableTransport()

    const link = new StandardLink(codec, transport, {
      plugins: [new TimeoutLinkPlugin({ timeout: 1000 })],
    })

    const promise = link.call(['test'], 'input', { context: {} })
    promise.catch(() => {})

    await vi.advanceTimersByTimeAsync(999)
    expect(vi.getTimerCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(1)
    await expect(promise).rejects.toSatisfy(error =>
      error instanceof AbortError
      && error.message === 'Request timed out after 1000ms',
    )
  })

  it('should support dynamic timeout based on interceptor options', async () => {
    const codec = makeCodec()
    const transport = makeAbortableTransport()

    const timeout = vi.fn(({ context }: any) => context.timeout)

    const link = new StandardLink(codec, transport, {
      plugins: [new TimeoutLinkPlugin({ timeout })],
    })

    const promise = link.call(['test'], 'input', { context: { timeout: 1000 } })
    promise.catch(() => {})

    await vi.advanceTimersByTimeAsync(1000)
    await expect(promise).rejects.toBeInstanceOf(AbortError)

    expect(timeout).toHaveBeenCalledTimes(1)
    expect(timeout).toHaveBeenCalledWith(expect.objectContaining({
      path: ['test'],
      input: 'input',
      context: { timeout: 1000 },
    }))
  })

  it.each([null, undefined])('should disable timeout when value is %s', async (timeout) => {
    const codec = makeCodec()
    const transport = makeTransport()

    vi.mocked(transport.send).mockImplementation(() => new Promise((resolve) => {
      setTimeout(() => resolve({
        status: 200,
        headers: {},
        resolveBody: async () => 'success',
      } satisfies StandardLazyResponse), 100_000)
    }))

    const link = new StandardLink(codec, transport, {
      plugins: [new TimeoutLinkPlugin({ timeout })],
    })

    const promise = link.call(['test'], 'input', { context: {} })
    await vi.advanceTimersByTimeAsync(100_000)

    expect(await promise).toBe('success')
    expect(vi.mocked(transport.send).mock.calls[0]![2].signal).toBeUndefined()
  })

  it('should forward abort from the caller signal', async () => {
    const codec = makeCodec()
    const transport = makeAbortableTransport()

    const controller = new AbortController()
    const reason = new Error('user cancelled')

    const link = new StandardLink(codec, transport, {
      plugins: [new TimeoutLinkPlugin({ timeout: 5000 })],
    })

    const promise = link.call(['test'], 'input', { context: {}, signal: controller.signal })
    promise.catch(() => {})

    await vi.advanceTimersByTimeAsync(500)
    controller.abort(reason)

    await expect(promise).rejects.toBe(reason)
  })

  it('should apply timeout while the caller signal is still active', async () => {
    const codec = makeCodec()
    const transport = makeAbortableTransport()

    const controller = new AbortController()

    const link = new StandardLink(codec, transport, {
      plugins: [new TimeoutLinkPlugin({ timeout: 1000 })],
    })

    const promise = link.call(['test'], 'input', { context: {}, signal: controller.signal })
    promise.catch(() => {})

    await vi.advanceTimersByTimeAsync(1000)
    await expect(promise).rejects.toSatisfy(error =>
      error instanceof AbortError
      && error.message === 'Request timed out after 1000ms',
    )
  })
})
