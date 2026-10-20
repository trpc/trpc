import { Deferred, Effect, Equal, Hash, RcMap, Scope, Stream } from 'effect';
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

/**
 * What calls must have in common to share a request. Equal keys compare
 * their inputs and call options deeply, so they hash only by name.
 */
class Key implements Equal.Equal {
  readonly name: string;
  readonly byInput: boolean;
  readonly options: Record<string, unknown>;
  /** The call that opens the request, if this key opens one. */
  readonly args: EffectLinkOpts<DedupeContext>;

  constructor(
    name: string,
    byInput: boolean,
    options: Record<string, unknown>,
    args: EffectLinkOpts<DedupeContext>,
  ) {
    this.name = name;
    this.byInput = byInput;
    this.options = options;
    this.args = args;
  }

  [Equal.symbol](that: Equal.Equal): boolean {
    if (!(that instanceof Key)) return false;
    const op = this.args.op;
    const other = that.args.op;
    return (
      this.name === that.name &&
      op.lastEventId === other.lastEventId &&
      (!this.byInput || deepEqual(op.input, other.input)) &&
      deepEqual(this.options, that.options)
    );
  }

  [Hash.symbol](): number {
    return Hash.string(this.name);
  }
}

interface Shared {
  /** The request, run once while any caller reads it. */
  readonly stream: OperationStream;
  /** Told each response, for their `onResponse`. */
  readonly callers: Set<Caller>;
  readonly responses: ResponseMeta[];
  /** The request's `signal`, aborted once every caller still in it has aborted. */
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

/** Succeeds once `signal` aborts; interrupting it removes its listener. */
const aborted = (signal: AbortSignal | undefined): Effect.Effect<void> =>
  signal === undefined
    ? Effect.never
    : Effect.callback<void>((resume) => {
        const onAbort = () => resume(Effect.void);
        signal.addEventListener('abort', onAbort, { once: true });
        return Effect.sync(() => signal.removeEventListener('abort', onAbort));
      });

const tell = (shared: Shared, caller: Caller, meta: ResponseMeta) => {
  try {
    caller.op.context.onResponse?.(meta);
  } catch (cause) {
    shared.callers.delete(caller);
    Deferred.doneUnsafe(caller.failed, Effect.fail(toClientError(cause)));
  }
};

/**
 * Shares one request between identical queries or subscriptions: a call
 * with the same path, deeply equal input (in any key order), equal call
 * options such as `headers`, and the same `lastEventId` as one that hasn't
 * sent anything back yet joins it, and gets every value, the end and any
 * error. Once a value arrives, a new call sends its own. Each caller's
 * `onResponse` is called. The request stops once every caller has stopped
 * reading, and its `signal` aborts once every caller still reading has
 * aborted: one that has left no longer counts. Mutations pass
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
  /**
   * The joinable requests. An entry leaves the map at its request's first
   * value or end, and closes, stopping the request, once its last caller
   * leaves.
   */
  const requests: RcMap.RcMap<Key, Shared> = Effect.runSync(
    RcMap.make({ lookup: (key: Key) => open(key) }).pipe(
      Scope.provide(Scope.makeUnsafe()),
    ),
  );

  const open = Effect.fnUntraced(function* (key: Key) {
    const args = key.args;
    const callers = new Set<Caller>();
    const responses: ResponseMeta[] = [];
    const controller = new AbortController();
    let joinable = true;
    const forget = Effect.suspend(() => {
      if (!joinable) return Effect.void;
      joinable = false;
      return RcMap.invalidate(requests, key);
    });
    const shared: Shared = {
      stream: yield* Stream.share(
        args
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
          ),
        { capacity: 'unbounded' },
      ),
      callers,
      responses,
      controller,
      unaborted: 0,
    };
    return shared;
  });

  const join = (args: EffectLinkOpts<DedupeContext>) => {
    const op = args.op;
    const key = new Key(
      opts.key ? opts.key(op) : op.path,
      opts.key === undefined,
      callOptions(op.context),
      args,
    );
    const caller: Caller = { op, failed: Deferred.makeUnsafe() };
    // Joins in the step that subscribes to `shared.stream`: `interruptWhen`
    // runs its stream on a forked fiber, and a request that ends before that
    // fiber subscribes would be run again for it.
    const joined = Stream.unwrap(
      Effect.gen(function* () {
        const shared = yield* RcMap.get(requests, key);
        shared.callers.add(caller);
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => shared.callers.delete(caller)),
        );
        // A caller that leaves stops counting, and its listener goes with it,
        // so a long-lived signal doesn't keep the request. The client's own
        // listener on the signal can end the caller before this one runs, so
        // leaving checks the signal too.
        shared.unaborted++;
        yield* aborted(op.signal).pipe(
          Effect.onExit(() =>
            Effect.sync(() => {
              if (--shared.unaborted === 0 && op.signal?.aborted)
                shared.controller.abort();
            }),
          ),
          Effect.forkScoped({ startImmediately: true }),
        );
        for (const meta of shared.responses) tell(shared, caller, meta);
        return shared.stream;
      }),
    );
    return joined.pipe(Stream.interruptWhen(Deferred.await(caller.failed)));
  };

  return link<{ context: DedupeContext }>((args) =>
    args.op.type === 'mutation' || args.op.context.dedupe === false
      ? args.next(args.op)
      : Stream.suspend(() => join(args)),
  );
}
