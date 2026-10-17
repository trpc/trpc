import { Cause, Effect, FiberSet, Queue, Stream } from 'effect';
import {
  clientErrorFromCause,
  link,
  toClientError,
  type Operation,
  type TrpcLink,
} from '../client/link.ts';
import {
  isTrpcError,
  TrpcError,
  type AnyTrpcError,
} from '../internal/error.ts';
import type { ProcedureType } from '../internal/types.ts';

/**
 * The operation a v11 link receives.
 * @since 0.1.0
 * @stability stable
 */
export interface V11Operation {
  id: number;
  type: ProcedureType;
  path: string;
  input: unknown;
  context: Record<string, unknown>;
  signal: AbortSignal | null | undefined;
}

/**
 * What a v11 link's observable emits: a result, or for subscriptions a
 * `started`, `stopped` or connection `state` event.
 * @since 0.1.0
 * @stability stable
 */
export interface V11ResultEnvelope {
  result: {
    type?: 'data' | 'started' | 'stopped' | 'state' | undefined;
    data?: unknown;
    id?: string | undefined;
  };
  context?: Record<string, unknown> | undefined;
}

/**
 * The observable v11 links return and receive from `next`.
 * @since 0.1.0
 * @stability stable
 */
export interface V11Observable<T> {
  subscribe(observer: {
    next?: (value: T) => void;
    error?: (error: any) => void;
    complete?: () => void;
  }): { unsubscribe(): void };
  pipe(...operators: Array<(source: any) => any>): any;
}

/**
 * A v11 link, `TRPCLink` from `@trpc/client`.
 * @since 0.1.0
 * @stability stable
 */
export type V11Link = (runtime: {}) => (opts: {
  op: V11Operation;
  next: (op: V11Operation) => V11Observable<V11ResultEnvelope>;
}) => V11Observable<any>;

const v11Observable = <T>(
  subscribe: (observer: {
    next?: (value: T) => void;
    error?: (error: unknown) => void;
    complete?: () => void;
  }) => () => void,
): V11Observable<T> => {
  const self: V11Observable<T> = {
    subscribe(observer) {
      let closed = false;
      let teardown: (() => void) | undefined;
      const unsubscribe = () => {
        if (closed) return;
        closed = true;
        teardown?.();
      };
      teardown = subscribe({
        next: (value) => {
          if (!closed) observer.next?.(value);
        },
        error: (error) => {
          if (closed) return;
          closed = true;
          observer.error?.(error);
        },
        complete: () => {
          if (closed) return;
          closed = true;
          observer.complete?.();
        },
      });
      if (closed) teardown();
      return { unsubscribe };
    },
    pipe: (...operators) =>
      operators.reduce((source, operator) => operator(source), self),
  };
  return self;
};

const toV11Operation = (op: Operation): V11Operation => ({
  id: op.id,
  type: op.type,
  path: op.path,
  input: op.input,
  context: op.context as Record<string, unknown>,
  signal: op.signal ?? null,
});

/** v11 errors are `TRPCClientError`s, with the code in `data.code`. */
const fromV11Error = (error: unknown): AnyTrpcError => {
  if (isTrpcError(error)) return error;
  const code = (error as { data?: { code?: unknown } } | undefined)?.data?.code;
  if (typeof code !== 'string') return toClientError(error);
  return new TrpcError({
    code,
    message: error instanceof Error ? error.message : code,
    data: (error as { data?: unknown }).data,
    cause: error,
  });
};

/**
 * Runs a v11 link (`TRPCLink` from `@trpc/client`) in a v12 chain, so
 * custom links keep working while you rewrite them as Effect links. The
 * v11 link sees v11 operations and observables; the errors it gets from
 * `next` are v12 `TrpcError`s, with the code on `code` and `data.code`
 * left as the procedure set it.
 *
 * @example
 * ```ts
 * import { fromV11Link } from '@trpc12/trpc/interop';
 *
 * createTrpcClient({
 *   router: routerType<AppRouter>(),
 *   links: [fromV11Link(myV11AuthLink), httpLink({ url })],
 * });
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function fromV11Link(v11Link: V11Link): TrpcLink {
  const operationLink = v11Link({});
  return link((opts) =>
    Stream.callback<unknown, AnyTrpcError>((queue) =>
      Effect.gen(function* () {
        const fibers = yield* FiberSet.make<void, never>();
        const fork = yield* FiberSet.runtime(fibers)<never>();
        const v11Next = (o: V11Operation) =>
          v11Observable<V11ResultEnvelope>((observer) => {
            if (o.type === 'subscription') {
              observer.next?.({ result: { type: 'started' } });
            }
            const fiber = fork(
              Stream.runForEach(
                opts.next({
                  ...opts.op,
                  id: o.id,
                  type: o.type,
                  path: o.path,
                  input: o.input,
                  context: o.context,
                  signal: o.signal ?? undefined,
                }),
                (data) =>
                  Effect.sync(() =>
                    observer.next?.({ result: { type: 'data', data } }),
                  ),
              ).pipe(
                Effect.matchCause({
                  onSuccess: () => observer.complete?.(),
                  onFailure: (cause) => {
                    if (!Cause.hasInterruptsOnly(cause)) {
                      observer.error?.(clientErrorFromCause(cause));
                    }
                  },
                }),
              ),
            );
            return () => fiber.interruptUnsafe();
          });
        const subscription = operationLink({
          op: toV11Operation(opts.op),
          next: v11Next,
        }).subscribe({
          next: (envelope: V11ResultEnvelope) => {
            const { result } = envelope;
            if (result.type === 'started' || result.type === 'state') return;
            if (result.type === 'stopped') {
              Queue.endUnsafe(queue);
              return;
            }
            Queue.offerUnsafe(queue, result.data);
            if (opts.op.type !== 'subscription') Queue.endUnsafe(queue);
          },
          error: (error) =>
            Queue.failCauseUnsafe(queue, Cause.fail(fromV11Error(error))),
          complete: () => Queue.endUnsafe(queue),
        });
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => subscription.unsubscribe()),
        );
      }),
    ),
  );
}
