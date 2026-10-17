import { Cause, Context, Exit, Layer, Option, Tracer } from 'effect';

/**
 * The parts of a Workers Traces span the tracer uses.
 * @since 0.1.0
 * @stability experimental
 */
export interface WorkersSpan {
  readonly isTraced: boolean;
  spanContext(): { readonly traceId: string; readonly spanId: string };
  setAttribute(key: string, value: boolean | number | string): unknown;
  setStatus(status: {
    code: 'unset' | 'ok' | 'error';
    message?: string;
  }): unknown;
  recordException(exception: {
    name: string;
    message?: string;
    stack?: string;
  }): void;
  end(): void;
}

/**
 * The parts of `tracing` from `cloudflare:workers` the tracer uses.
 * @since 0.1.0
 * @stability experimental
 */
export interface WorkersTracing {
  startActiveSpan<T>(name: string, fn: (span: WorkersSpan) => T): T;
}

/**
 * Runs `fn` in an async context captured earlier, as
 * `AsyncLocalStorage.snapshot()` returns.
 * @since 0.1.0
 * @stability experimental
 */
export type AsyncContextRunner = <R>(fn: () => R) => R;

/**
 * Options for {@link experimental_workersTracer}.
 * @since 0.1.0
 * @stability experimental
 */
export interface experimental_WorkersTracerOptions {
  /** `tracing` from `cloudflare:workers`. */
  readonly tracing: WorkersTracing;
  /**
   * Captures the current async context, e.g. `() => AsyncLocalStorage.snapshot()`
   * from `node:async_hooks` (`nodejs_compat`). With it, spans nest as Effect
   * nests them, and the spans Workers adds (subrequests, storage) sit under
   * the call that made them. Without it, every span is a child of the
   * request's span.
   */
  readonly snapshot?: () => AsyncContextRunner;
}

const attribute = (value: unknown): boolean | number | string => {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'bigint') return value.toString();
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

class WorkersEffectSpan extends Tracer.NativeSpan {
  run: AsyncContextRunner | undefined;
  readonly span: WorkersSpan;
  private readonly ended: () => void;
  constructor(
    options: ConstructorParameters<typeof Tracer.NativeSpan>[0],
    span: WorkersSpan,
    ended: () => void,
  ) {
    super(options);
    this.span = span;
    this.ended = ended;
    if (span.isTraced) {
      const context = span.spanContext();
      this._traceId = context.traceId;
      this._spanId = context.spanId;
    }
    if (options.kind !== 'internal')
      span.setAttribute('span.kind', options.kind);
  }
  override attribute(key: string, value: unknown): void {
    super.attribute(key, value);
    this.span.setAttribute(key, attribute(value));
  }
  override end(endTime: bigint, exit: Exit.Exit<unknown, unknown>): void {
    super.end(endTime, exit);
    if (Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause)) {
      const error = Cause.squash(exit.cause);
      const message = error instanceof Error ? error.message : String(error);
      this.span.recordException({
        name: error instanceof Error ? error.name : 'Error',
        message,
        stack: Cause.pretty(exit.cause),
      });
      this.span.setStatus({ code: 'error', message });
    } else {
      this.span.setStatus({ code: 'ok' });
    }
    this.span.end();
    this.ended();
  }
}

const evaluate = '~effect/Effect/evaluate';

/**
 * Records Effect's spans, so tRPC's client and server spans and any
 * `Effect.withSpan`, in Cloudflare Workers Traces, with no OpenTelemetry
 * SDK. Enable `observability.traces` in the Wrangler config, then provide
 * the layer to the handler (or the Effect client).
 *
 * @example
 * ```ts
 * import { tracing } from 'cloudflare:workers';
 * import { AsyncLocalStorage } from 'node:async_hooks';
 *
 * createFetchHandler({
 *   router,
 *   layer: experimental_workersTracer({ tracing, snapshot: () => AsyncLocalStorage.snapshot() }),
 * });
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function experimental_workersTracer(
  options: experimental_WorkersTracerOptions,
): Layer.Layer<never> {
  const runnerOf = (span: Tracer.AnySpan | undefined) =>
    span instanceof WorkersEffectSpan ? span.run : undefined;
  const tracer = Tracer.make({
    span(opts) {
      const parent = runnerOf(Option.getOrUndefined(opts.parent));
      let span!: WorkersEffectSpan;
      const start = () =>
        options.tracing.startActiveSpan(opts.name, (workers) => {
          let ended!: () => void;
          const pending = new Promise<void>((resolve) => {
            ended = resolve;
          });
          span = new WorkersEffectSpan(opts, workers, () => ended());
          span.run = options.snapshot?.();
          return pending;
        });
      void (parent ? parent(start) : start());
      return span;
    },
    context: options.snapshot
      ? (primitive, fiber) => {
          const run = runnerOf(
            Context.getOrUndefined(fiber.context, Tracer.ParentSpan),
          );
          return run
            ? run(() => primitive[evaluate](fiber))
            : primitive[evaluate](fiber);
        }
      : undefined,
  });
  return Layer.succeed(Tracer.Tracer, tracer);
}
