import type { Context, ContextAPI, Tracer as OpenTelemetryApiTracer, PropagationAPI, Span, TraceAPI } from '@opentelemetry/api'
import type { Promisable, Tracer, TracingAttributeValue, TracingException, TracingExceptionLevel, TracingSpan } from '@orpc/shared'
import { SpanStatusCode } from '@opentelemetry/api'

export class OpenTelemetrySpan implements TracingSpan {
  constructor(readonly span: Span) {}

  setAttribute(key: string, value: TracingAttributeValue): void {
    this.span.setAttribute(key, value)
  }

  updateName(name: string): void {
    this.span.updateName(name)
  }

  addEvent(name: string): void {
    this.span.addEvent(name)
  }

  recordException(level: TracingExceptionLevel, exception: TracingException): void {
    this.span.recordException(exception)

    if (level === 'error') {
      this.span.setStatus({
        code: SpanStatusCode.ERROR,
        message: exception.message,
      })
    }
  }

  end(): void {
    this.span.end()
  }
}

export interface OpenTelemetryTracerOptions {
  /**
   * Called for every span, so a tracer provider set after construction is picked up.
   */
  tracer: () => OpenTelemetryApiTracer
  trace: TraceAPI
  context: ContextAPI

  /**
   * propagation is optional, can reduce bundle size in some cases.
   */
  propagation?: PropagationAPI | undefined
}

export class OpenTelemetryTracer implements Tracer {
  private readonly tracer: () => OpenTelemetryApiTracer
  private readonly trace: TraceAPI
  private readonly context: ContextAPI

  readonly inject: Tracer['inject']
  readonly extract: Tracer['extract']

  constructor(options: OpenTelemetryTracerOptions) {
    this.tracer = options.tracer
    this.trace = options.trace
    this.context = options.context

    const propagation = options.propagation

    if (propagation !== undefined) {
      this.inject = (span, headers) => {
        propagation.inject(this.contextOf(span), headers)
      }

      this.extract = (headers) => {
        const span = this.trace.getSpan(propagation.extract(this.context.active(), headers))
        return span === undefined ? undefined : new OpenTelemetrySpan(span)
      }
    }
  }

  startSpan(name: string, parent?: TracingSpan): TracingSpan {
    const span = parent === undefined
      ? this.tracer().startSpan(name)
      : this.tracer().startSpan(name, undefined, this.contextOf(parent))

    return new OpenTelemetrySpan(span)
  }

  startActiveSpan<T>(name: string, parent: TracingSpan | undefined, fn: (span: TracingSpan) => Promise<T>): Promise<T> {
    const callback = (span: Span) => fn(new OpenTelemetrySpan(span))

    if (parent === undefined) {
      return this.tracer().startActiveSpan(name, callback)
    }

    return this.tracer().startActiveSpan(name, {}, this.contextOf(parent), callback)
  }

  getActiveSpan(): TracingSpan | undefined {
    const span = this.trace.getActiveSpan()
    return span === undefined ? undefined : new OpenTelemetrySpan(span)
  }

  withActiveSpan<T>(span: TracingSpan, fn: () => Promisable<T>): Promisable<T> {
    return this.context.with(this.contextOf(span), fn)
  }

  private contextOf(parent: TracingSpan): Context {
    return this.trace.setSpan(this.context.active(), (parent as OpenTelemetrySpan).span)
  }
}
