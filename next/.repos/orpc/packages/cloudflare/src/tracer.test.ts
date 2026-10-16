import type { Tracer } from '@orpc/shared'
import { getTracer, setTracer } from '@orpc/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { experimental_CloudflareSpan as CloudflareSpan, experimental_CloudflareTracer as CloudflareTracer } from './tracer'

function createFakeSpan() {
  return {
    isTraced: true,
    setAttribute: vi.fn().mockReturnThis(),
    setAttributes: vi.fn().mockReturnThis(),
    recordException: vi.fn(),
    updateName: vi.fn().mockReturnThis(),
    setStatus: vi.fn().mockReturnThis(),
    end: vi.fn(),
  }
}

function createFakeTracing(span = createFakeSpan()) {
  return {
    span,
    enterSpan: vi.fn(),
    startActiveSpan: vi.fn((_name: string, callback: (span: any) => unknown) => callback(span)),
    startSpan: vi.fn(() => span),
    getActiveSpan: vi.fn(() => span),
  }
}

describe('cloudflareTracer', () => {
  afterEach(() => {
    setTracer(undefined)
  })

  it('enables and disables itself as the oRPC tracer', () => {
    const tracer = new CloudflareTracer({ tracing: createFakeTracing() as any })

    tracer.enable()
    expect(getTracer()).toBe(tracer)

    tracer.disable()
    expect(getTracer()).toBeUndefined()
  })

  it('starts active spans with the manually ended startActiveSpan', async () => {
    const fake = createFakeTracing()
    const tracer = new CloudflareTracer({ tracing: fake as any })

    const result = await tracer.startActiveSpan('name', undefined, async (span) => {
      expect(span).toBeInstanceOf(CloudflareSpan)
      expect((span as CloudflareSpan).span).toBe(fake.span)
      return 'out'
    })

    expect(result).toBe('out')
    expect(fake.startActiveSpan).toHaveBeenCalledWith('name', expect.any(Function))
    expect(fake.enterSpan).not.toHaveBeenCalled()
    expect(fake.span.end).not.toHaveBeenCalled()
  })

  it('starts detached spans with startSpan', () => {
    const fake = createFakeTracing()
    const tracer = new CloudflareTracer({ tracing: fake as any })

    const span = tracer.startSpan('name') as CloudflareSpan
    expect(span.span).toBe(fake.span)
    expect(fake.startSpan).toHaveBeenCalledWith('name')

    span.end()
    expect(fake.span.end).toHaveBeenCalledTimes(1)
  })

  it('returns the active span', () => {
    const fake = createFakeTracing()
    const tracer = new CloudflareTracer({ tracing: fake as any })

    expect((tracer.getActiveSpan() as CloudflareSpan).span).toBe(fake.span)

    fake.getActiveSpan.mockReturnValue(undefined as any)
    expect(tracer.getActiveSpan()).toBeUndefined()
  })

  it('runs the callback directly for withActiveSpan', async () => {
    const tracer = new CloudflareTracer({ tracing: createFakeTracing() as any })
    const span = tracer.startSpan('name')

    expect(tracer.withActiveSpan(span, () => 'out')).toBe('out')
  })

  it('has no propagation methods', () => {
    const tracer: Tracer = new CloudflareTracer({ tracing: createFakeTracing() as any })
    expect(tracer.inject).toBeUndefined()
    expect(tracer.extract).toBeUndefined()
  })

  describe('span', () => {
    it('sets primitive attributes as is and serializes arrays', () => {
      const fake = createFakeSpan()
      const span = new CloudflareSpan(fake as any)

      span.setAttribute('string', 'value')
      span.setAttribute('number', 1)
      span.setAttribute('boolean', true)
      span.setAttribute('array', ['a', 'b'])

      expect(fake.setAttribute).toHaveBeenNthCalledWith(1, 'string', 'value')
      expect(fake.setAttribute).toHaveBeenNthCalledWith(2, 'number', 1)
      expect(fake.setAttribute).toHaveBeenNthCalledWith(3, 'boolean', true)
      expect(fake.setAttribute).toHaveBeenNthCalledWith(4, 'array', '["a","b"]')
    })

    it('renames spans', () => {
      const fake = createFakeSpan()
      const span = new CloudflareSpan(fake as any)

      span.updateName('renamed')

      expect(fake.updateName).toHaveBeenCalledWith('renamed')
    })

    it('ignores events', () => {
      const fake = createFakeSpan()
      const span = new CloudflareSpan(fake as any)

      span.addEvent('event')

      expect(fake.setAttribute).not.toHaveBeenCalled()
      expect(fake.end).not.toHaveBeenCalled()
    })

    it('records error level exceptions natively and marks the span as failed', () => {
      const fake = createFakeSpan()
      const span = new CloudflareSpan(fake as any)
      const exception = { name: 'TypeError', message: 'boom', stack: 'stack', code: 'CODE' }

      span.recordException('error', exception)

      expect(fake.recordException).toHaveBeenCalledWith(exception)
      expect(fake.setStatus).toHaveBeenCalledWith({ code: 'error', message: 'boom' })
    })

    it('records info level exceptions natively without marking the span as failed', () => {
      const fake = createFakeSpan()
      const span = new CloudflareSpan(fake as any)
      const exception = { name: 'AbortError', message: 'aborted', stack: 'stack' }

      span.recordException('info', exception)

      expect(fake.recordException).toHaveBeenCalledWith(exception)
      expect(fake.setStatus).not.toHaveBeenCalled()
    })
  })

  /**
   * The vitest workers pool still bundles a workerd without getActiveSpan, recordException,
   * updateName, and setStatus, so only the older methods run against the real runtime here.
   */
  describe('with the runtime tracing api', () => {
    it('defaults to the tracing export of cloudflare:workers', () => {
      const tracer = new CloudflareTracer()

      tracer.enable()
      expect(getTracer()).toBe(tracer)
    })

    it('records spans without throwing', async () => {
      const tracer = new CloudflareTracer()

      const result = await tracer.startActiveSpan('active', undefined, async (span) => {
        span.setAttribute('key', 'value')
        span.setAttribute('path', ['a', 'b'])
        span.addEvent('event')

        const detached = tracer.startSpan('detached')
        detached.end()

        expect(tracer.withActiveSpan(span, () => 'inner')).toBe('inner')

        span.end()
        return 'out'
      })

      expect(result).toBe('out')
    })

    it('rethrows errors from active spans', async () => {
      const tracer = new CloudflareTracer()

      await expect(tracer.startActiveSpan('failing', undefined, async () => {
        throw new Error('boom')
      })).rejects.toThrow('boom')
    })
  })
})
