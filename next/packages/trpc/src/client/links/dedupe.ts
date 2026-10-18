import { Cause, Effect, Exit, Fiber, Queue, Stream } from 'effect';
import type { AnyTrpcError } from '../../internal/error.ts';
import {
  link,
  toClientError,
  type EffectLinkOpts,
  type Operation,
  type ResponseMeta,
  type TrpcLink,
} from '../link.ts';
import { deepEqual } from './equal.ts';

/**
 * Options for {@link dedupeLink}.
 * @since 0.1.0
 * @stability stable
 */
export interface DedupeLinkOptions {
  /**
   * Groups calls by this string instead of comparing their inputs: calls
   * with the same key, equal call options and the same `lastEventId` share
   * a request.
   * @default the path, then the inputs compared deeply
   */
  key?: (op: Operation) => string;
}

/**
 * What {@link dedupeLink} reads from `context`.
 * @since 0.1.0
 * @stability stable
 */
export interface DedupeContext {
  /** `false` sends this query or subscription on its own. */
  dedupe?: boolean;
}

interface Caller {
  readonly op: Operation<DedupeContext>;
  readonly queue: Queue.Queue<unknown, AnyTrpcError | Cause.Done>;
}

interface Shared {
  readonly key: string;
  readonly op: Operation;
  readonly options: Record<string, unknown>;
  readonly callers: Set<Caller>;
  readonly responses: ResponseMeta[];
  /** The request's `signal`, aborted once every caller's signal has. */
  readonly controller: AbortController;
  unaborted: number;
  fiber?: Fiber.Fiber<unknown, unknown>;
}

const ignored = new Set(['dedupe', 'onResponse']);
const normalized = new Map<string, (value: never) => unknown>([
  ['headers', (value: HeadersInit) => new Headers(value)],
  [
    'init',
    (value: RequestInit) =>
      value.headers === undefined
        ? value
        : { ...value, headers: new Headers(value.headers) },
  ],
]);

/** The call options two calls must have in common to share a request. */
function callOptions(context: object): Record<string, unknown> {
  const options: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(context)) {
    if (value === undefined || ignored.has(name)) continue;
    const normalize = normalized.get(name) as
      | ((value: unknown) => unknown)
      | undefined;
    options[name] = normalize ? normalize(value) : value;
  }
  return options;
}

/**
 * Shares one request between identical queries or subscriptions: a call
 * with the same path, deeply equal input (in any key order), equal call
 * options such as `headers`, and the same `lastEventId` as one that hasn't
 * sent anything back yet joins it, and gets every value, the end and any
 * error. Once a value arrives, a new call sends its own. Each caller's
 * `onResponse` is called. The request stops once every caller has stopped
 * reading, and its `signal` aborts once every caller's has. Mutations pass
 * through.
 *
 * Every caller gets the same value: a stream in a query's output is one
 * stream, and callers that each read it should pass `dedupe: false`.
 *
 * @example
 * ```ts
 * createTrpcClient({
 *   router: routerType<AppRouter>(),
 *   links: [dedupeLink(), httpLink({ url })],
 * });
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function dedupeLink(
  opts: DedupeLinkOptions = {},
): TrpcLink<{ context: DedupeContext }> {
  const joinable = new Set<Shared>();

  const leave = (shared: Shared, caller: Caller) => {
    if (!shared.callers.delete(caller) || shared.callers.size > 0) return;
    joinable.delete(shared);
    Effect.runFork(Fiber.interrupt(shared.fiber!));
  };
  const tell = (shared: Shared, caller: Caller, meta: ResponseMeta) => {
    try {
      caller.op.context.onResponse?.(meta);
    } catch (cause) {
      Queue.failCauseUnsafe(caller.queue, Cause.fail(toClientError(cause)));
      leave(shared, caller);
    }
  };

  const run = (shared: Shared, next: EffectLinkOpts['next']) =>
    Stream.runForEach(
      next({
        ...shared.op,
        signal: shared.controller.signal,
        context: {
          ...shared.op.context,
          onResponse: (meta) => {
            shared.responses.push(meta);
            for (const caller of shared.callers) tell(shared, caller, meta);
          },
        },
      }),
      (value) =>
        Effect.sync(() => {
          joinable.delete(shared);
          for (const caller of shared.callers) {
            Queue.offerUnsafe(caller.queue, value);
          }
        }),
    ).pipe(
      Effect.onExit((exit) =>
        Effect.sync(() => {
          joinable.delete(shared);
          for (const caller of shared.callers) {
            if (Exit.isSuccess(exit)) Queue.endUnsafe(caller.queue);
            else Queue.failCauseUnsafe(caller.queue, exit.cause);
          }
        }),
      ),
      Effect.ignore,
    );

  const join = (args: EffectLinkOpts<DedupeContext>) => {
    const op = args.op;
    const key = opts.key ? opts.key(op) : op.path;
    const options = callOptions(op.context);
    const shared: Shared = [...joinable].find(
      (other) =>
        other.key === key &&
        other.op.lastEventId === op.lastEventId &&
        (opts.key !== undefined || deepEqual(other.op.input, op.input)) &&
        deepEqual(other.options, options),
    ) ?? {
      key,
      op,
      options,
      callers: new Set(),
      responses: [],
      controller: new AbortController(),
      unaborted: 0,
    };
    joinable.add(shared);
    const caller: Caller = { op, queue: Effect.runSync(Queue.unbounded()) };
    shared.callers.add(caller);
    shared.unaborted++;
    op.signal?.addEventListener('abort', () => {
      if (--shared.unaborted === 0) shared.controller.abort();
    });
    for (const meta of shared.responses) tell(shared, caller, meta);
    if (!shared.fiber) {
      // Set before it runs: a link can respond while it starts.
      Effect.runFork(run(shared, args.next), {
        onFiberStart: (fiber) => {
          shared.fiber = fiber;
        },
      });
    }
    return Stream.fromQueue(caller.queue).pipe(
      Stream.ensuring(Effect.sync(() => leave(shared, caller))),
    );
  };

  return link<{ context: DedupeContext }>((args) =>
    args.op.type === 'mutation' || args.op.context.dedupe === false
      ? args.next(args.op)
      : Stream.suspend(() => join(args)),
  );
}
