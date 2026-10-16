import type { Promisable, Tracer, TracingAttributeValue, TracingException, TracingExceptionLevel, TracingSpan } from '@orpc/shared'
import { setTracer, toSpanAttributeValue } from '@orpc/shared'
/**
 * A namespace import keeps `@orpc/cloudflare` loadable on runtimes that predate the
 * `tracing` export, so users of the other adapters are not affected by it.
 */
import * as workers from 'cloudflare:workers'

class CloudflareSpan implements TracingSpan {
  constructor(readonly span: Span) {}

  setAttribute(key: string, value: TracingAttributeValue): void {
    this.span.setAttribute(key, Array.isArray(value) ? toSpanAttributeValue(value) : value)
  }

  updateName(name: string): void {
    this.span.updateName(name)
  }

  addEvent(_name: string): void {
    // Workers Traces have no custom span events
  }

  recordException(level: TracingExceptionLevel, exception: TracingException): void {
    this.span.recordException(exception)

    if (level === 'error') {
      this.span.setStatus({ code: 'error', message: exception.message })
    }
  }

  end(): void {
    this.span.end()
  }
}

export { CloudflareSpan as experimental_CloudflareSpan }

export interface experimental_CloudflareTracerOptions {
  /**
   * The Workers tracing API to record spans with.
   *
   * @default tracing from `cloudflare:workers`
   */
  tracing?: Tracing
}

/**
 * Records oRPC spans with Cloudflare Workers Traces.
 *
 * @see {@link https://orpc.dev/docs/integrations/cloudflare-traces | Cloudflare Workers Traces Integration}
 */
export class experimental_CloudflareTracer implements Tracer {
  private readonly tracing: Tracing

  constructor(options: experimental_CloudflareTracerOptions = {}) {
    this.tracing = options.tracing ?? workers.tracing
  }

  startSpan(name: string): TracingSpan {
    // Workers Traces nest spans by async context, so the parent option is not needed
    return new CloudflareSpan(this.tracing.startSpan(name))
  }

  startActiveSpan<T>(name: string, _parent: TracingSpan | undefined, fn: (span: TracingSpan) => Promise<T>): Promise<T> {
    return this.tracing.startActiveSpan(name, span => fn(new CloudflareSpan(span)))
  }

  getActiveSpan(): TracingSpan | undefined {
    const span = this.tracing.getActiveSpan()
    return span === undefined ? undefined : new CloudflareSpan(span)
  }

  withActiveSpan<T>(_span: TracingSpan, fn: () => Promisable<T>): Promisable<T> {
    // Workers Traces cannot activate an existing span
    return fn()
  }

  /**
   * Makes oRPC record its spans with this tracer.
   */
  enable(): void {
    setTracer(this)
  }

  disable(): void {
    setTracer(undefined)
  }
}
