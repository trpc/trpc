import { Cause, Effect, Exit, Fiber, Queue, Stream } from 'effect';
import { TrpcError, type AnyTrpcError } from '../../internal/error.ts';
import { toAsyncIterable } from '../../internal/effects.ts';
import {
  firstValue,
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
   * with the same key and equal call options share a request.
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
  /** `false` sends this query on its own. */
  dedupe?: boolean;
}

type Deferred = AsyncIterable<unknown, unknown> | ReadableStream<unknown>;
type Path = ReadonlyArray<string>;

/** One call sharing a request. */
interface Caller {
  readonly args: EffectLinkOpts;
  /** What its `onResponse` threw, which fails only this call. */
  failure: AnyTrpcError | undefined;
  /** The call sent on its own, once it starts reading a stream too late to share it. */
  alone: Promise<unknown> | undefined;
}

/** A stream in a shared result, read once and copied to each reader. */
interface Tee {
  readonly source: Deferred;
  readonly readers: Set<Queue.Queue<unknown, unknown>>;
  /** An item has been read, or reading stopped: a reader starting now would miss items. */
  started: boolean;
  returned: unknown;
  fiber: Fiber.Fiber<void, unknown> | undefined;
}

/** One shared request. */
interface InFlight {
  readonly input: unknown;
  readonly options: Record<string, unknown>;
  readonly controller: AbortController;
  readonly callers: Set<Caller>;
  readonly responses: ResponseMeta[];
  readonly promise: Promise<Exit.Exit<unknown, AnyTrpcError>>;
  /** Callers still waiting for the result. */
  waiting: number;
  /** Callers holding a result with streams whose signal hasn't aborted. */
  holding: number;
  /** The result's streams by the object they're read from; `null` when it has none. */
  tees: Map<object, Tee> | null | undefined;
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

const isDeferred = (value: unknown): value is Deferred =>
  value instanceof ReadableStream ||
  (typeof value === 'object' &&
    value !== null &&
    Symbol.asyncIterator in value);

const isContainer = (value: unknown): value is Record<string, unknown> =>
  Array.isArray(value) ||
  (typeof value === 'object' &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype);

/** The streams in a result, in its plain objects and arrays. */
function collect(value: unknown, found: Set<Deferred>, seen: Set<object>) {
  if (isDeferred(value)) found.add(value);
  if (!isContainer(value) || seen.has(value)) return;
  seen.add(value);
  for (const child of Object.values(value)) collect(child, found, seen);
}

/** `value` with each stream replaced by `wrap`'s, copying only the containers on the way. */
function rebuild(
  value: unknown,
  path: Path,
  tees: Map<object, Tee>,
  wrap: (tee: Tee, path: Path) => unknown,
  memo: Map<object, unknown>,
): unknown {
  const tee = typeof value === 'object' && value !== null && tees.get(value);
  if (tee) return wrap(tee, path);
  if (!isContainer(value)) return value;
  if (memo.has(value)) return memo.get(value);
  memo.set(value, value);
  let copy: Record<string, unknown> | undefined;
  for (const [key, child] of Object.entries(value)) {
    const next = rebuild(child, [...path, key], tees, wrap, memo);
    if (next === child) continue;
    copy ??= Array.isArray(value)
      ? [...(value as unknown[])]
      : Object.assign(Object.create(Object.getPrototypeOf(value)), value);
    copy![key] = next;
  }
  memo.set(value, copy ?? value);
  return copy ?? value;
}

const at = (value: unknown, path: Path): unknown =>
  path.reduce<unknown>(
    (parent, key) => (isContainer(parent) ? parent[key] : undefined),
    value,
  );

/** Reads the source once, handing each item to every reader's queue. */
const pump = (tee: Tee): Effect.Effect<void, unknown> =>
  Effect.scoped(
    Effect.gen(function* () {
      const iterator = (tee.source as AsyncIterable<unknown, unknown>)[
        Symbol.asyncIterator
      ]();
      yield* Effect.addFinalizer(() =>
        Effect.promise(async () => {
          await iterator.return?.();
        }),
      );
      while (true) {
        const next = yield* Effect.tryPromise({
          try: () => iterator.next(),
          catch: (cause) => cause,
        });
        tee.started = true;
        if (next.done) {
          tee.returned = next.value;
          return;
        }
        for (const queue of tee.readers) Queue.offerUnsafe(queue, next.value);
      }
    }),
  ).pipe(
    // The pump is interrupted only once no reader is left to tell.
    Effect.onExit((exit) =>
      Effect.sync(() => {
        tee.started = true;
        for (const queue of tee.readers) {
          if (Exit.isSuccess(exit)) Queue.endUnsafe(queue);
          else Queue.failCauseUnsafe(queue, exit.cause);
        }
      }),
    ),
  );

/** A reader stops; after the last one, so does reading the source. */
function leave(tee: Tee, queue: Queue.Queue<unknown, unknown>): void {
  if (!tee.readers.delete(queue) || tee.readers.size > 0) return;
  tee.started = true;
  Effect.runFork(Fiber.interrupt(tee.fiber!));
}

/** What a caller reads one of its streams through. */
interface Reader {
  next(): Promise<IteratorResult<unknown, unknown>>;
  return(value?: unknown): Promise<IteratorResult<unknown, unknown>>;
}

/** A reader of a stream nothing has been read from yet: it gets every item. */
function join(tee: Tee, signal: AbortSignal | undefined): Reader {
  const queue = Effect.runSync(Queue.unbounded<unknown, unknown>());
  tee.readers.add(queue);
  tee.fiber ??= Effect.runFork(pump(tee));
  if (signal?.aborted) leave(tee, queue);
  else
    signal?.addEventListener('abort', () => leave(tee, queue), { once: true });
  const items = toAsyncIterable(
    Stream.fromQueue(queue).pipe(
      Stream.ensuring(Effect.sync(() => leave(tee, queue))),
    ),
    signal,
  )[Symbol.asyncIterator]() as Required<AsyncIterator<unknown>>;
  return {
    next: async () => {
      const next = await items.next();
      return next.done ? { done: true, value: tee.returned } : next;
    },
    return: async (value?: unknown) => {
      leave(tee, queue);
      await items.return();
      return { done: true, value };
    },
  };
}

/** A reader that starts after items were read: it sends its call on its own and reads that. */
function alone(caller: Caller, path: Path): Reader {
  const open = async () => {
    caller.alone ??= Effect.runPromiseExit(
      firstValue(caller.args.next(caller.args.op)),
      { signal: caller.args.op.signal },
    ).then((exit) => {
      if (Exit.isSuccess(exit)) return exit.value;
      throw Cause.squash(exit.cause);
    });
    const value = at(await caller.alone, path);
    if (!isDeferred(value)) {
      throw new TrpcError({
        code: 'CLIENT_ERROR',
        message: 'The query sent again has no stream where the first had one',
      });
    }
    return (value as AsyncIterable<unknown, unknown>)[Symbol.asyncIterator]();
  };
  let opened: Promise<AsyncIterator<unknown, unknown>> | undefined;
  return {
    next: async () => (await (opened ??= open())).next(),
    return: async (value?: unknown) => {
      if (opened) await (await opened).return?.(value);
      return { done: true, value };
    },
  };
}

/** The caller's own stream in place of `tee`'s source, of the same kind. */
function wrap(tee: Tee, path: Path, caller: Caller): Deferred {
  const read = () =>
    tee.started ? alone(caller, path) : join(tee, caller.args.op.signal);
  if (!(tee.source instanceof ReadableStream)) {
    return { [Symbol.asyncIterator]: read };
  }
  let iterator: Reader | undefined;
  return new ReadableStream(
    {
      async pull(controller) {
        iterator ??= read();
        const next = await iterator.next();
        if (next.done) controller.close();
        else controller.enqueue(next.value);
      },
      async cancel() {
        await iterator?.return();
      },
    },
    { highWaterMark: 0 },
  );
}

/** Calls the caller's `onResponse`; what it throws fails only that caller. */
function report(caller: Caller, meta: ResponseMeta): void {
  const onResponse = caller.args.op.context.onResponse;
  if (!onResponse || caller.failure) return;
  try {
    onResponse(meta);
  } catch (cause) {
    caller.failure = toClientError(cause);
  }
}

/** The result as `caller` gets it: the shared value, with its own copy of each stream. */
function resultFor(entry: InFlight, value: unknown, caller: Caller): unknown {
  if (entry.tees === undefined) {
    const found = new Set<Deferred>();
    collect(value, found, new Set());
    const tees = new Map<object, Tee>();
    for (const source of found) {
      tees.set(source, {
        source,
        readers: new Set(),
        started: false,
        returned: undefined,
        fiber: undefined,
      });
    }
    entry.tees = tees.size > 0 ? tees : null;
  }
  if (entry.tees === null) return value;
  const signal = caller.args.op.signal;
  entry.holding++;
  signal?.addEventListener(
    'abort',
    () => {
      if (--entry.holding === 0) entry.controller.abort();
    },
    { once: true },
  );
  return rebuild(
    value,
    [],
    entry.tees,
    (tee, path) => wrap(tee, path, caller),
    new Map(),
  );
}

/**
 * Shares one request between identical queries in flight at the same time:
 * the same path, deeply equal inputs (in any key order) and equal call
 * options such as `headers`. Every caller gets the same result value, and
 * each `onResponse` is called. A stream in the result is copied to each
 * caller that starts reading it before an item has been read; a caller
 * that starts later sends its query again for its own. The request is
 * aborted only when every caller has aborted. Don't change an input while
 * its call is in flight.
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
  const inFlight = new Map<string, InFlight[]>();
  const remove = (key: string, entry: InFlight | Promise<unknown>) => {
    const rest = (inFlight.get(key) ?? []).filter(
      (other) => other !== entry && other.promise !== entry,
    );
    if (rest.length > 0) inFlight.set(key, rest);
    else inFlight.delete(key);
  };

  const start = (
    key: string,
    args: EffectLinkOpts,
    options: Record<string, unknown>,
  ): InFlight => {
    const controller = new AbortController();
    const callers = new Set<Caller>();
    const responses: ResponseMeta[] = [];
    const onResponse = (meta: ResponseMeta) => {
      responses.push(meta);
      for (const caller of callers) report(caller, meta);
    };
    const promise: Promise<Exit.Exit<unknown, AnyTrpcError>> =
      Effect.runPromiseExit(
        firstValue(
          args.next({
            ...args.op,
            context: { ...args.op.context, onResponse },
            signal: controller.signal,
          }),
        ),
        { signal: controller.signal },
      ).finally(() => remove(key, promise));
    const entry: InFlight = {
      input: args.op.input,
      options,
      controller,
      callers,
      responses,
      promise,
      waiting: 0,
      holding: 0,
      tees: undefined,
    };
    inFlight.set(key, [...(inFlight.get(key) ?? []), entry]);
    return entry;
  };

  return link<{ context: DedupeContext }>((args) => {
    const op = args.op;
    if (op.type !== 'query' || op.context.dedupe === false)
      return args.next(op);
    const key = opts.key ? opts.key(op) : op.path;
    const options = callOptions(op.context);
    return Stream.fromEffect(
      Effect.callback<unknown, AnyTrpcError>((resume) => {
        const entry =
          inFlight
            .get(key)
            ?.find(
              (other) =>
                (opts.key !== undefined || deepEqual(other.input, op.input)) &&
                deepEqual(other.options, options),
            ) ?? start(key, args, options);
        const caller: Caller = { args, failure: undefined, alone: undefined };
        entry.callers.add(caller);
        for (const meta of entry.responses) report(caller, meta);
        entry.waiting++;
        void entry.promise.then((exit) => {
          if (caller.failure) resume(Exit.fail(caller.failure));
          else if (Exit.isFailure(exit)) resume(exit);
          else resume(Exit.succeed(resultFor(entry, exit.value, caller)));
        });
        return Effect.sync(() => {
          entry.callers.delete(caller);
          if (--entry.waiting === 0) {
            remove(key, entry);
            entry.controller.abort();
          }
        });
      }),
    );
  });
}
