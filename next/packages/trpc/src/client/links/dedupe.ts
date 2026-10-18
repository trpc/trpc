import { Deferred, Effect, Scope, Stream } from 'effect';
import type { AnyTrpcError } from '../../internal/error.ts';
import {
  link,
  toClientError,
  type EffectLinkOpts,
  type Operation,
  type OperationStream,
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
  /** Failed when its `onResponse` throws, which fails only this caller. */
  readonly failed: Deferred.Deferred<never, AnyTrpcError>;
}

interface Shared {
  readonly key: string;
  readonly op: Operation;
  readonly options: Record<string, unknown>;
  /** The request, run once while any caller reads it. */
  readonly stream: OperationStream;
  readonly callers: Set<Caller>;
  readonly responses: ResponseMeta[];
  /** The request's `signal`, aborted once every caller's signal has. */
  readonly controller: AbortController;
  unaborted: number;
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

  const tell = (shared: Shared, caller: Caller, meta: ResponseMeta) => {
    try {
      caller.op.context.onResponse?.(meta);
    } catch (cause) {
      shared.callers.delete(caller);
      Deferred.doneUnsafe(caller.failed, Effect.fail(toClientError(cause)));
    }
  };

  const open = (
    args: EffectLinkOpts<DedupeContext>,
    key: string,
    options: Shared['options'],
  ): Shared => {
    const callers = new Set<Caller>();
    const responses: ResponseMeta[] = [];
    const controller = new AbortController();
    const forget = Effect.sync(() => joinable.delete(shared));
    const request = args
      .next({
        ...args.op,
        signal: controller.signal,
        context: {
          ...args.op.context,
          onResponse: (meta) => {
            responses.push(meta);
            for (const caller of callers) tell(shared, caller, meta);
          },
        },
      })
      .pipe(
        Stream.tap(() => forget),
        Stream.ensuring(forget),
      );
    const shared: Shared = {
      key,
      op: args.op,
      options,
      stream: Effect.runSync(
        Scope.provide(
          Stream.share(request, { capacity: 'unbounded' }),
          Scope.makeUnsafe(),
        ),
      ),
      callers,
      responses,
      controller,
      unaborted: 0,
    };
    joinable.add(shared);
    return shared;
  };

  const join = (args: EffectLinkOpts<DedupeContext>) => {
    const op = args.op;
    const key = opts.key ? opts.key(op) : op.path;
    const options = callOptions(op.context);
    const shared =
      [...joinable].find(
        (other) =>
          other.key === key &&
          other.op.lastEventId === op.lastEventId &&
          (opts.key !== undefined || deepEqual(other.op.input, op.input)) &&
          deepEqual(other.options, options),
      ) ?? open(args, key, options);
    const caller: Caller = { op, failed: Deferred.makeUnsafe() };
    shared.callers.add(caller);
    shared.unaborted++;
    op.signal?.addEventListener('abort', () => {
      if (--shared.unaborted === 0) shared.controller.abort();
    });
    for (const meta of shared.responses) tell(shared, caller, meta);
    return shared.stream.pipe(
      Stream.interruptWhen(Deferred.await(caller.failed)),
      Stream.ensuring(
        Effect.sync(() => {
          shared.callers.delete(caller);
          if (shared.callers.size === 0) joinable.delete(shared);
        }),
      ),
    );
  };

  return link<{ context: DedupeContext }>((args) =>
    args.op.type === 'mutation' || args.op.context.dedupe === false
      ? args.next(args.op)
      : Stream.suspend(() => join(args)),
  );
}
