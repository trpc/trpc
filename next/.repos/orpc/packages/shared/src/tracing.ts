import type { Promisable } from 'type-fest'
import { isAbortError } from './error'

const TRACER_SYMBOL = Symbol.for('ORPC_TRACER')

export type TracingAttributeValue = string | number | boolean | string[] | number[] | boolean[]

export interface TracingException {
  name?: string
  message: string
  stack?: string
  code?: string | number
}

export type TracingHeaders = Record<string, string | string[] | undefined>

export type TracingExceptionLevel = 'error' | 'info'

export interface TracingSpan {
  setAttribute(key: string, value: TracingAttributeValue): void
  /**
   * Renames the span. Backends that cannot rename spans ignore it.
   */
  updateName(name: string): void
  /**
   * Adds an event to the span. Backends without span events ignore it.
   */
  addEvent(name: string): void
  /**
   * Records an exception on the span. The `error` level also marks the span as failed.
   */
  recordException(level: TracingExceptionLevel, exception: TracingException): void
  end(): void
}

/**
 * The tracing backend oRPC records spans with, see `@orpc/opentelemetry` and `@orpc/cloudflare`.
 *
 * A `parent` defaults to the active span of the backend when omitted.
 */
export interface Tracer {
  /**
   * Starts a span without making it active. The caller must end it.
   */
  startSpan(name: string, parent?: TracingSpan): TracingSpan
  /**
   * Starts a span, makes it active while `fn` runs, and passes it to `fn`. The caller must end it.
   */
  startActiveSpan<T>(name: string, parent: TracingSpan | undefined, fn: (span: TracingSpan) => Promise<T>): Promise<T>
  getActiveSpan(): TracingSpan | undefined
  /**
   * Runs `fn` with `span` as the active span. Backends that cannot activate a span run `fn` directly.
   */
  withActiveSpan<T>(span: TracingSpan, fn: () => Promisable<T>): Promisable<T>
  /**
   * Writes the trace context of `span` into `headers`. Absent when the backend does not propagate context.
   */
  inject?(span: TracingSpan, headers: TracingHeaders): void
  /**
   * Reads the remote parent from `headers`. Absent when the backend does not propagate context.
   */
  extract?(headers: TracingHeaders): TracingSpan | undefined
}

export function setTracer(tracer: Tracer | undefined): void {
  (globalThis as Record<symbol, unknown>)[TRACER_SYMBOL] = tracer
}

export function getTracer(): Tracer | undefined {
  return (globalThis as Record<symbol, unknown>)[TRACER_SYMBOL] as Tracer | undefined
}

export interface StartSpanOptions {
  /**
   * The name of the span to create.
   */
  name: string
  /**
   * The span to use as parent. Defaults to the active span of the backend.
   */
  parent?: TracingSpan | undefined
}

export function startSpan(options: StartSpanOptions | string): TracingSpan | undefined {
  const tracer = getTracer()

  if (!tracer) {
    return undefined
  }

  if (typeof options === 'string') {
    return tracer.startSpan(options)
  }

  return tracer.startSpan(options.name, options.parent)
}

export function recordSpanError(span: TracingSpan | undefined, error: unknown): void {
  if (!span) {
    return
  }

  // DO NOT treat aborted error as error if happen during business logic (assumed)
  span.recordException(isAbortError(error) ? 'info' : 'error', toTracingException(error))
}

export function setSpanAttributeIfDefined(span: TracingSpan | undefined, key: string, value: TracingAttributeValue | undefined): void {
  if (!span || value === undefined) {
    return
  }

  span.setAttribute(key, value)
}

export function toTracingException(error: unknown): TracingException {
  if (error instanceof Error) {
    const exception: TracingException = {
      message: error.message,
      name: error.name,
      stack: error.stack,
    }

    if ('code' in error && (typeof error.code === 'string' || typeof error.code === 'number')) {
      exception.code = error.code
    }

    return exception
  }

  return { message: String(error) }
}

export function toSpanAttributeValue(data: unknown): string {
  if (data === undefined) {
    return 'undefined'
  }

  try {
    // eslint-disable-next-line ban/ban
    return JSON.stringify(data, (_, value) => {
      if (typeof value === 'bigint') {
        return value.toString()
      }

      if (value instanceof Map || value instanceof Set) {
        return Array.from(value)
      }

      return value
    })
  }
  catch {
    return String(data)
  }
}

export async function runWithSpan<T>(
  options: string | StartSpanOptions,
  fn: (span?: TracingSpan) => Promisable<T>,
): Promise<T> {
  const tracer = getTracer()

  if (!tracer) {
    return fn()
  }

  const name = typeof options === 'string' ? options : options.name
  const parent = typeof options === 'string' ? undefined : options.parent

  return tracer.startActiveSpan(name, parent, async (span) => {
    try {
      return await fn(span)
    }
    catch (e) {
      recordSpanError(span, e)
      throw e
    }
    finally {
      span.end()
    }
  })
}

export function runInSpanContext<T>(
  span: TracingSpan | undefined,
  fn: () => Promisable<T>,
): Promisable<T> {
  const tracer = getTracer()

  if (!span || !tracer) {
    return fn()
  }

  return tracer.withActiveSpan(span, fn)
}
