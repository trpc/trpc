import {
  getTracer,
  recordSpanError,
  runInSpanContext,
  runWithSpan,
  setSpanAttributeIfDefined,
  setTracer,
  startSpan,
  toSpanAttributeValue,
  toTracingException,
} from './tracing'

function createMockSpan() {
  return {
    addEvent: vi.fn(),
    end: vi.fn(),
    recordException: vi.fn(),
    setAttribute: vi.fn(),
    updateName: vi.fn(),
  }
}

function createMockTracer() {
  return {
    getActiveSpan: vi.fn(),
    startActiveSpan: vi.fn(),
    startSpan: vi.fn(),
    withActiveSpan: vi.fn(),
  }
}

describe('tracing', () => {
  beforeEach(() => {
    const originalTracer = getTracer()
    setTracer(undefined)
    return () => {
      setTracer(originalTracer)
    }
  })

  describe('tracer', () => {
    it('sets and gets the tracer', () => {
      const tracer = createMockTracer() as any
      setTracer(tracer)
      expect(getTracer()).toBe(tracer)
      setTracer(undefined)
      expect(getTracer()).toBeUndefined()
    })
  })

  describe('startSpan', () => {
    it('returns undefined when no tracer is set', () => {
      expect(startSpan('test')).toBeUndefined()
    })

    it('creates a span when a tracer is set', () => {
      const mockSpan = createMockSpan()
      const tracer = createMockTracer()
      tracer.startSpan.mockReturnValue(mockSpan)
      setTracer(tracer as any)

      const parent = createMockSpan() as any
      const result = startSpan({ name: 'test', parent })
      expect(result).toBe(mockSpan)
      expect(tracer.startSpan).toHaveBeenCalledWith('test', parent)
    })

    it('accepts options as string', () => {
      const mockSpan = createMockSpan()
      const tracer = createMockTracer()
      tracer.startSpan.mockReturnValue(mockSpan)
      setTracer(tracer as any)

      const result = startSpan('test')
      expect(result).toBe(mockSpan)
      expect(tracer.startSpan).toHaveBeenCalledWith('test')
    })
  })

  describe('recordSpanError', () => {
    it('does nothing when span is undefined', () => {
      expect(() => recordSpanError(undefined, new Error('message'))).not.toThrow()
    })

    it('records an error level exception on span', () => {
      const mockSpan = createMockSpan() as any
      const error = new Error('test')
      recordSpanError(mockSpan, error)

      expect(mockSpan.recordException).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ message: 'test', name: 'Error' }),
      )
    })

    it('records AbortError at info level', () => {
      const mockSpan = createMockSpan() as any
      const error = new Error('aborted')
      error.name = 'AbortError'
      recordSpanError(mockSpan, error)

      expect(mockSpan.recordException).toHaveBeenCalledWith(
        'info',
        expect.objectContaining({ message: 'aborted', name: 'AbortError' }),
      )
    })
  })

  describe('setSpanAttributeIfDefined', () => {
    it('does nothing when span is undefined', () => {
      expect(() => setSpanAttributeIfDefined(undefined, 'key', 'value')).not.toThrow()
    })

    it('does nothing when value is undefined', () => {
      const mockSpan = createMockSpan() as any
      setSpanAttributeIfDefined(mockSpan, 'key', undefined)
      expect(mockSpan.setAttribute).not.toHaveBeenCalled()
    })

    it('sets attribute when value is defined', () => {
      const mockSpan = createMockSpan() as any
      setSpanAttributeIfDefined(mockSpan, 'key', 'value')
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('key', 'value')
    })
  })

  describe('toTracingException', () => {
    it('converts error to exception', () => {
      const error = new Error('test')
      error.stack = 'stack'
      const exception = toTracingException(error)
      expect(exception).toEqual({ message: 'test', name: 'Error', stack: 'stack' })
    })

    it('includes numeric code', () => {
      const error = new Error('test') as any
      error.code = 123
      const exception = toTracingException(error)
      expect(exception.code).toBe(123)
    })

    it('includes string code', () => {
      const error = new Error('test') as any
      error.code = 'CODE'
      const exception = toTracingException(error)
      expect(exception.code).toBe('CODE')
    })

    it('converts non-error to exception', () => {
      expect(toTracingException('test')).toEqual({ message: 'test' })
      expect(toTracingException(123)).toEqual({ message: '123' })
    })
  })

  describe('toSpanAttributeValue', () => {
    it('serializes values', () => {
      expect(toSpanAttributeValue(undefined)).toBe('undefined')
      expect(toSpanAttributeValue(123)).toBe('123')
      expect(toSpanAttributeValue('abc')).toBe('"abc"')
      expect(toSpanAttributeValue({ a: 1 })).toBe('{"a":1}')
      expect(toSpanAttributeValue(123n)).toBe('"123"')
      expect(toSpanAttributeValue(new Set([1]))).toBe('[1]')
      expect(toSpanAttributeValue(new Map([[1, 2]]))).toBe('[[1,2]]')
    })

    it('handles circular references or errors during stringify', () => {
      const obj: any = {}
      obj.self = obj
      expect(toSpanAttributeValue(obj)).toBe('[object Object]')
    })
  })

  describe('runWithSpan', () => {
    it('runs function without span when no tracer', async () => {
      const fn = vi.fn().mockResolvedValue('out')
      const result = await runWithSpan('test', fn)
      expect(result).toBe('out')
      expect(fn).toHaveBeenCalledWith()
    })

    it('starts active span, runs function and ends span', async () => {
      const tracer = createMockTracer()
      const mockSpan = createMockSpan()
      tracer.startActiveSpan.mockImplementation((name, options, cb) => cb(mockSpan))
      setTracer(tracer as any)

      const fn = vi.fn().mockResolvedValue('out')
      const result = await runWithSpan('test', fn)

      expect(result).toBe('out')
      expect(tracer.startActiveSpan).toHaveBeenCalledWith('test', undefined, expect.any(Function))
      expect(fn).toHaveBeenCalledWith(mockSpan)
      expect(mockSpan.end).toHaveBeenCalledTimes(1)
    })

    it('records error and ends span when function fails', async () => {
      const tracer = createMockTracer()
      const mockSpan = createMockSpan()
      tracer.startActiveSpan.mockImplementation((name, options, cb) => cb(mockSpan))
      setTracer(tracer as any)

      const error = new Error('fail')
      const fn = vi.fn().mockRejectedValue(error)

      await expect(runWithSpan('test', fn)).rejects.toThrow('fail')
      expect(mockSpan.recordException).toHaveBeenCalledWith('error', expect.objectContaining({ message: 'fail' }))
      expect(mockSpan.end).toHaveBeenCalledTimes(1)
    })

    it('passes the parent option to the tracer', async () => {
      const tracer = createMockTracer()
      const mockSpan = createMockSpan()
      tracer.startActiveSpan.mockImplementation((name, options, cb) => cb(mockSpan))
      setTracer(tracer as any)

      const parent = createMockSpan() as any
      const fn = vi.fn().mockResolvedValue('out')
      const result = await runWithSpan({ name: 'test', parent }, fn)

      expect(result).toBe('out')
      expect(tracer.startActiveSpan).toHaveBeenCalledWith('test', parent, expect.any(Function))
    })
  })

  describe('runInSpanContext', () => {
    it('runs function directly when no span or no tracer', async () => {
      const fn = vi.fn().mockResolvedValue('out')
      expect(await runInSpanContext(undefined, fn)).toBe('out')

      const mockSpan = createMockSpan()
      expect(await runInSpanContext(mockSpan as any, fn)).toBe('out')

      const tracer = createMockTracer()
      setTracer(tracer as any)
      expect(await runInSpanContext(undefined, fn)).toBe('out')
      expect(tracer.withActiveSpan).not.toHaveBeenCalled()
    })

    it('runs function with the span as active span', async () => {
      const tracer = createMockTracer()
      const mockSpan = createMockSpan()
      setTracer(tracer as any)
      tracer.withActiveSpan.mockImplementation((span, cb) => cb())

      const fn = vi.fn().mockResolvedValue('result')
      const result = await runInSpanContext(mockSpan as any, fn)

      expect(result).toBe('result')
      expect(tracer.withActiveSpan).toHaveBeenCalledWith(mockSpan, fn)
    })
  })
})
