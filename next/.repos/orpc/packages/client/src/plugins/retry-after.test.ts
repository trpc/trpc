import type { StandardLazyResponse, StandardRequest } from '@standard-server/core'
import type { StandardLinkCodec, StandardLinkTransport } from '../adapters/standard'
import { StandardLink } from '../adapters/standard'
import { RetryAfterLinkPlugin } from './retry-after'

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

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  expect(vi.getTimerCount()).toBe(0)
  vi.useRealTimers()
})

describe('retryAfterLinkPlugin', () => {
  describe('core behavior', () => {
    it.each([429, 503])('should retry on %i with retry-after header and succeed', async (status) => {
      const codec = makeCodec()
      const transport = makeTransport()

      let callCount = 0
      vi.mocked(transport.send).mockImplementation(async () => {
        callCount++
        if (callCount === 1) {
          return {
            status,
            headers: { 'retry-after': '2' },
            resolveBody: async () => 'rate limited',
          } satisfies StandardLazyResponse
        }
        return {
          status: 200,
          headers: {},
          resolveBody: async () => 'success',
        } satisfies StandardLazyResponse
      })

      const link = new StandardLink(codec, transport, {
        plugins: [new RetryAfterLinkPlugin()],
      })

      const promise = link.call(['test'], 'input', { context: {} })
      await vi.runAllTimersAsync()

      expect(await promise).toBe('success')
      expect(transport.send).toHaveBeenCalledTimes(2)
    })

    it('should not retry without retry-after header or on non-retryable status', async () => {
      const testCases = [
        { status: 200, headers: {}, body: 'success' },
        { status: 429, headers: {}, body: 'rate limited' },
        { status: 500, headers: { 'retry-after': '1' }, body: 'internal error' },
      ]

      for (const { status, headers, body } of testCases) {
        const codec = makeCodec()
        const transport = makeTransport()

        vi.mocked(transport.send).mockResolvedValue({
          status,
          headers,
          resolveBody: async () => body,
        } satisfies StandardLazyResponse)

        const link = new StandardLink(codec, transport, {
          plugins: [new RetryAfterLinkPlugin()],
        })

        const result = await link.call(['test'], 'input', { context: {} })

        expect(result).toBe(body)
        expect(transport.send).toHaveBeenCalledTimes(1)
        vi.clearAllMocks()
      }
    })
  })

  describe('retry-after parsing', () => {
    it.each([
      { value: '3', description: 'seconds' },
      { value: new Date(Date.now() + 5000).toUTCString(), description: 'HTTP date' },
      { value: '  2  ', description: 'whitespace' },
    ])('should parse various retry-after formats: %s', async ({ value }) => {
      const codec = makeCodec()
      const transport = makeTransport()

      let callCount = 0
      vi.mocked(transport.send).mockImplementation(async () => {
        callCount++
        if (callCount === 1) {
          return {
            status: 429,
            headers: { 'retry-after': value },
            resolveBody: async () => 'rate limited',
          } satisfies StandardLazyResponse
        }
        return {
          status: 200,
          headers: {},
          resolveBody: async () => 'success',
        } satisfies StandardLazyResponse
      })

      const link = new StandardLink(codec, transport, {
        plugins: [new RetryAfterLinkPlugin()],
      })

      const promise = link.call(['test'], 'input', { context: {} })
      await vi.runAllTimersAsync()

      expect(await promise).toBe('success')
      expect(transport.send).toHaveBeenCalledTimes(2)
      vi.clearAllMocks()
    })

    it('should not retry on invalid retry-after values', async () => {
      const invalidValues = ['invalid', '']

      for (const val of invalidValues) {
        const codec = makeCodec()
        const transport = makeTransport()

        vi.mocked(transport.send).mockResolvedValue({
          status: 429,
          headers: { 'retry-after': val },
          resolveBody: async () => 'rate limited',
        } satisfies StandardLazyResponse)

        const link = new StandardLink(codec, transport, {
          plugins: [new RetryAfterLinkPlugin()],
        })

        const result = await link.call(['test'], 'input', { context: {} })

        expect(result).toBe('rate limited')
        expect(transport.send).toHaveBeenCalledTimes(1)
        vi.clearAllMocks()
      }
    })
  })

  it('should respect maxAttempts option', async () => {
    const codec = makeCodec()
    const transport = makeTransport()

    const maxAttempts = vi.fn(() => 2)

    vi.mocked(transport.send).mockResolvedValue({
      status: 429,
      headers: { 'retry-after': '0' },
      resolveBody: async () => 'rate limited',
    } satisfies StandardLazyResponse)

    const link = new StandardLink(codec, transport, {
      plugins: [new RetryAfterLinkPlugin({ maxAttempts })],
    })

    const promise = link.call(['test'], 'input', { context: { context: true } })
    await vi.runAllTimersAsync()

    expect(await promise).toBe('rate limited')
    expect(transport.send).toHaveBeenCalledTimes(2)
    expect(maxAttempts).toHaveBeenCalledWith(
      expect.objectContaining({ status: 429 }),
      expect.objectContaining({ context: { context: true } }),
    )
  })

  describe('timeout and custom condition', () => {
    it('should stop retrying after timeout', async () => {
      const codec = makeCodec()
      const transport = makeTransport()

      vi.mocked(transport.send).mockResolvedValue({
        status: 429,
        headers: { 'retry-after': '2' },
        resolveBody: async () => 'rate limited',
      } satisfies StandardLazyResponse)

      const timeoutFn = vi.fn(() => 3000)

      const link = new StandardLink(codec, transport, {
        plugins: [new RetryAfterLinkPlugin({ timeout: timeoutFn })],
      })

      const promise = link.call(['test'], 'input', { context: {} })
      await vi.runAllTimersAsync()

      expect(await promise).toBe('rate limited')
      expect(transport.send).toHaveBeenCalledTimes(2)
      expect(timeoutFn).toHaveBeenCalledWith(
        expect.objectContaining({ status: 429 }),
        expect.objectContaining({ context: {} }),
      )
    })

    it('should respect custom condition', async () => {
      const codec = makeCodec()
      const transport = makeTransport()

      let callCount = 0
      vi.mocked(transport.send).mockImplementation(async () => {
        callCount++
        if (callCount === 1) {
          return {
            status: 400,
            headers: { 'retry-after': '1' },
            resolveBody: async () => 'bad request',
          } satisfies StandardLazyResponse
        }
        return {
          status: 200,
          headers: {},
          resolveBody: async () => 'success',
        } satisfies StandardLazyResponse
      })

      const condition = vi.fn((response: StandardLazyResponse) => response.status === 400)

      const link = new StandardLink(codec, transport, {
        plugins: [new RetryAfterLinkPlugin({ condition })],
      })

      const promise = link.call(['test'], 'input', { context: {} })
      await vi.runAllTimersAsync()

      expect(await promise).toBe('success')
      expect(transport.send).toHaveBeenCalledTimes(2)
      expect(condition).toHaveBeenCalledWith(
        expect.objectContaining({ status: 400 }),
        expect.objectContaining({ context: {} }),
      )
    })
  })

  describe('request body', () => {
    it.each([
      ['ReadableStream', () => new Blob(['data']).stream()],
      ['AsyncIteratorObject', () => (async function* () { yield 'data' })()],
    ])('should not retry a %s body, since it cannot be resent', async (_, createBody) => {
      const codec = makeCodec()
      const transport = makeTransport()

      const body = createBody()
      vi.mocked(codec.encodeInput).mockResolvedValue({
        method: 'POST',
        url: '/test',
        headers: {},
        body,
      })

      vi.mocked(transport.send).mockResolvedValue({
        status: 429,
        headers: { 'retry-after': '0' },
        resolveBody: async () => 'rate limited',
      } satisfies StandardLazyResponse)

      const link = new StandardLink(codec, transport, {
        plugins: [new RetryAfterLinkPlugin()],
      })

      const result = await link.call(['test'], 'input', { context: {} })

      expect(result).toBe('rate limited')
      expect(transport.send).toHaveBeenCalledTimes(1)
      expect(transport.send).toHaveBeenCalledWith(expect.objectContaining({ body }), ['test'], expect.anything())
    })

    it.each([
      ['Blob', () => new Blob(['data'])],
      ['FormData', () => {
        const form = new FormData()
        form.append('file', new Blob(['data']))
        return form
      }],
    ])('should retry a %s body, since it can be resent', async (_, createBody) => {
      const codec = makeCodec()
      const transport = makeTransport()

      vi.mocked(codec.encodeInput).mockResolvedValue({
        method: 'POST',
        url: '/test',
        headers: {},
        body: createBody(),
      })

      vi.mocked(transport.send).mockResolvedValueOnce({
        status: 429,
        headers: { 'retry-after': '0' },
        resolveBody: async () => 'rate limited',
      } satisfies StandardLazyResponse)

      const link = new StandardLink(codec, transport, {
        plugins: [new RetryAfterLinkPlugin()],
      })

      const promise = link.call(['test'], 'input', { context: {} })
      await vi.runAllTimersAsync()

      expect(await promise).toBe('success')
      expect(transport.send).toHaveBeenCalledTimes(2)
    })
  })

  describe('signal handling', () => {
    it('should stop retrying when signal is aborted during delay', async () => {
      const codec = makeCodec()
      const transport = makeTransport()

      vi.mocked(transport.send).mockResolvedValue({
        status: 429,
        headers: { 'retry-after': '5' },
        resolveBody: async () => 'rate limited',
      } satisfies StandardLazyResponse)

      const controller = new AbortController()

      const link = new StandardLink(codec, transport, {
        plugins: [new RetryAfterLinkPlugin()],
      })

      const promise = link.call(['test'], 'input', { context: {}, signal: controller.signal })

      await vi.advanceTimersByTimeAsync(2000)
      controller.abort()
      await vi.advanceTimersByTimeAsync(3000)

      expect(await promise).toBe('rate limited')
      expect(transport.send).toHaveBeenCalledTimes(1)
    })

    it('should not retry if signal is already aborted', async () => {
      const codec = makeCodec()
      const transport = makeTransport()

      vi.mocked(transport.send).mockResolvedValue({
        status: 429,
        headers: { 'retry-after': '1' },
        resolveBody: async () => 'rate limited',
      } satisfies StandardLazyResponse)

      const controller = new AbortController()
      controller.abort()

      const link = new StandardLink(codec, transport, {
        plugins: [new RetryAfterLinkPlugin()],
      })

      const result = await link.call(['test'], 'input', { context: {}, signal: controller.signal })

      expect(result).toBe('rate limited')
      expect(transport.send).toHaveBeenCalledTimes(1)
    })
  })
})
