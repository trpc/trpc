import { Effect, Exit } from 'effect';
import { toAsyncIterable } from '../internal/effects.ts';
import {
  ERROR_STATUS,
  frameworkError,
  hasDigest,
  isBuiltinCode,
  type AnyTrpcError,
} from '../internal/error.ts';
import type { IsAny, ProcedureType } from '../internal/types.ts';
import type { AnySerializer } from '../serializer/index.ts';
import {
  chainSerializer,
  chainSwitchNames,
  clientErrorFromCause,
  firstValue,
  runLinks,
  type Operation,
  type AtLeastOneLink,
  type BuiltinCallOptions,
} from './link.ts';
import type {
  DuplicateSwitchCheck,
  LinksContext,
  LinksTypes,
  RouterOf,
  SubscribeOptions,
  TrpcClient,
  LinkErrorCode,
  TrpcIterable,
  TrpcPromise,
  UnmetNeedCheck,
} from './types.ts';

/**
 * @since 0.1.0
 * @stability stable
 */
export function createRecursiveProxy(
  callback: (path: readonly string[], args: unknown[]) => unknown,
  path: readonly string[] = [],
): any {
  return new Proxy((...args: unknown[]) => callback(path, args), {
    get(_target, key) {
      if (typeof key !== 'string' || key === 'then') return undefined;
      return createRecursiveProxy(callback, [...path, key]);
    },
  });
}

const METHODS = {
  query: 'query',
  mutate: 'mutation',
  subscribe: 'subscription',
} as const satisfies Record<string, ProcedureType>;

let nextId = 0;

/**
 * @since 0.1.0
 * @stability stable
 */
export function makeOperation(
  type: ProcedureType,
  path: string,
  input: unknown,
  opts: UntypedCallOptions | undefined,
): Operation {
  return {
    id: ++nextId,
    type,
    path,
    input,
    context: opts?.context ?? {},
    signal: opts?.signal,
    lastEventId: opts?.lastEventId,
  };
}

/**
 * Splits typed call options into `signal`, `lastEventId` and the fields
 * links read.
 * @since 0.1.0
 * @stability stable
 */
export function splitCallOptions(
  opts: SubscribeOptions<object> | undefined,
): UntypedCallOptions {
  if (!opts) return {};
  const { signal, lastEventId, ...context } = opts;
  return { signal, lastEventId, context };
}

/**
 * Call options as the untyped client takes them: what links read is in
 * `context`.
 * @since 0.1.0
 * @stability stable
 */
export interface UntypedCallOptions {
  signal?: AbortSignal | undefined;
  context?: BuiltinCallOptions | undefined;
  /** Subscriptions: resume after this event id. */
  lastEventId?: string | undefined;
}

/**
 * Options for {@link createTrpcClient}.
 * @since 0.1.0
 * @stability stable
 */
export interface TrpcClientOptions {
  /** The request chain. The last link sends the request. */
  links: AtLeastOneLink;
}

/**
 * Options for a client typed from a `router:` value (17 D-C).
 * @since 0.1.0
 * @stability stable
 */
export interface TypedClientOptions<
  TSource,
  TLinks extends AtLeastOneLink<RouterOf<TSource>>,
> {
  /** `routerType<AppRouter>()`, a contract, or the router itself. */
  router: TSource;
  /** The request chain. What the links declare types the call options. */
  links: TLinks;
}

/**
 * The untyped client that typed clients and integrations are built on.
 * @since 0.1.0
 * @stability stable
 */
export interface TrpcUntypedClient {
  /** Runs a query or mutation. */
  request(
    opts: Omit<UntypedCallOptions, 'lastEventId'> & {
      type: 'query' | 'mutation';
      path: string;
      input?: unknown;
    },
  ): Promise<unknown>;
  /** Starts a subscription. */
  subscribe(
    opts: UntypedCallOptions & { path: string; input?: unknown },
  ): AsyncIterable<unknown>;
}

/**
 * Creates a client without router types (16 (f)).
 *
 * @example
 * ```ts
 * const untyped = createUntypedClient({ links: [httpLink({ url })] });
 * const post = await untyped.request({ type: 'query', path: 'post.byId', input: { id: '1' } });
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function createUntypedClient(
  opts: TrpcClientOptions,
): TrpcUntypedClient {
  const { links } = opts;
  chainSwitchNames(links);
  return {
    async request(o) {
      const op = makeOperation(o.type, o.path, o.input, o);
      const exit = await Effect.runPromiseExit(
        firstValue(runLinks(links, op)),
        {
          signal: op.signal,
        },
      );
      if (Exit.isSuccess(exit)) return exit.value;
      const error = clientErrorFromCause(exit.cause);
      throw frameworkError(error) ?? error;
    },
    subscribe(o) {
      return {
        [Symbol.asyncIterator]() {
          const op = makeOperation('subscription', o.path, o.input, o);
          return toAsyncIterable(runLinks(links, op), op.signal)[
            Symbol.asyncIterator
          ]();
        },
      };
    },
  };
}

/**
 * Creates a typed client for a router (16 CS-A). With `router:` (17 D-C)
 * the call options are typed from what the links declare, and
 * router-aware links like `splitLink` see typed paths. An `any` router (an
 * `AppRouter` import that doesn't resolve) gives the
 * {@link TrpcUntypedClient}, whose `request()` and `subscribe()` work on
 * any client.
 *
 * @example
 * ```ts
 * import type { AppRouter } from './server';
 *
 * const client = createTrpcClient({
 *   router: routerType<AppRouter>(),
 *   links: [dedupeLink(), httpLink({ url: 'http://localhost:3000/trpc' })],
 * });
 * const post = await client.post.byId.query({ id: '1' }, { signal });
 * for await (const event of client.onPost.subscribe()) render(event);
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function createTrpcClient<
  TSource,
  const TLinks extends AtLeastOneLink<RouterOf<TSource>>,
>(
  opts: TypedClientOptions<TSource, TLinks> &
    DuplicateSwitchCheck<TLinks> &
    UnmetNeedCheck<TLinks>,
): IsAny<RouterOf<TSource>> extends true
  ? TrpcUntypedClient
  : TrpcClient<
      RouterOf<TSource>,
      LinksContext<TLinks>,
      undefined,
      LinksTypes<TLinks>
    >;
export function createTrpcClient(opts: TrpcClientOptions): unknown {
  const untyped = createUntypedClient(opts);
  const client = createRecursiveProxy((path, args) => {
    const method = path.at(-1) as keyof typeof METHODS | undefined;
    const type = method ? METHODS[method] : undefined;
    const [root] = path;
    if (path.length === 1 && (root === 'request' || root === 'subscribe')) {
      return untyped[root](args[0] as never);
    }
    if (!type) {
      throw new TypeError(
        `Call .query(), .mutate() or .subscribe() on a procedure, not ${path.join('.')}()`,
      );
    }
    const procedurePath = path.slice(0, -1).join('.');
    const [input, typedOpts] = args as [
      unknown,
      SubscribeOptions<object> | undefined,
    ];
    const callOpts = splitCallOptions(typedOpts);
    if (type === 'subscription') {
      return untyped.subscribe({ path: procedurePath, input, ...callOpts });
    }
    return untyped.request({ type, path: procedurePath, input, ...callOpts });
  });
  const serializer = chainSerializer(opts.links);
  if (serializer) clientSerializers.set(client, serializer);
  return client;
}

const clientSerializers = new WeakMap<object, AnySerializer>();

/**
 * The serializer a client's links send with (the first link that has one),
 * for code that must match it, such as TanStack Query hydration.
 *
 * @example
 * ```ts
 * const serializer = getClientSerializer(client) ?? jsonSerializer;
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function getClientSerializer(client: object): AnySerializer | undefined {
  return clientSerializers.get(client);
}

/**
 * The result of `safe()`: a `[data, error]` tuple that also has `data` and
 * `error` properties (07 Q7.3). Check `error` first: once it's handled,
 * `data` is `T` (also when `T` itself allows `undefined`).
 * @since 0.1.0
 * @stability stable
 */
export type SafeResult<T, E> =
  | ([data: T, error: undefined] & {
      readonly data: T;
      readonly error: undefined;
    })
  | ([data: undefined, error: E] & {
      readonly data: undefined;
      readonly error: E;
    });

/**
 * Awaits a call without throwing. A framework's control-flow error (Next's
 * `redirect()`, which an in-process call rethrows) still throws.
 *
 * A streamed output or a subscription is iterated without throwing too:
 * each step is a result, and a failure is the last one.
 *
 * @example
 * ```ts
 * const [post, err] = await safe(client.post.byId.query({ id }));
 * if (err) {
 *   if (err.defined && err.code === 'NOT_FOUND') return `No post ${err.data.id}`;
 *   return err.message;
 * }
 * post.title;
 *
 * const { data, error } = await safe(client.post.create.mutate(input));
 *
 * for await (const [token, err] of safe(tokens)) {
 *   if (err) return err.message;
 *   render(token);
 * }
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function safe<T, E>(
  promise: TrpcPromise<T, E>,
): Promise<SafeResult<T, E>>;
/**
 * Iterates a streamed output or a subscription without throwing: each item
 * as `[item, undefined]`, and a failure as a last `[undefined, error]`. The
 * generator's return value isn't kept.
 * @since 0.1.0
 * @stability experimental
 */
export function safe<T, E>(
  iterable: TrpcIterable<T, any, E>,
): AsyncIterable<SafeResult<T, E>>;
// A call's `TrpcPromise` matches the first overload by reference; inferring
// `T` through `then` here costs several times as many instantiations.
export function safe<T, E = unknown>(
  promise: PromiseLike<T> & { readonly '~error'?: E },
): Promise<SafeResult<T, E>>;
export function safe(
  call: PromiseLike<unknown> | AsyncIterable<unknown>,
):
  | Promise<SafeResult<unknown, unknown>>
  | AsyncIterable<SafeResult<unknown, unknown>> {
  return 'then' in call && typeof call.then === 'function'
    ? settleSafely(call)
    : iterateSafely(call as AsyncIterable<unknown>);
}

const succeeded = (data: unknown): SafeResult<unknown, unknown> =>
  Object.assign([data, undefined] as [unknown, undefined], {
    data,
    error: undefined,
  });

const failed = (cause: unknown): SafeResult<unknown, unknown> => {
  if (hasDigest(cause)) throw cause;
  return Object.assign([undefined, cause] as [undefined, unknown], {
    data: undefined,
    error: cause,
  });
};

async function settleSafely(
  promise: PromiseLike<unknown>,
): Promise<SafeResult<unknown, unknown>> {
  try {
    return succeeded(await promise);
  } catch (cause) {
    return failed(cause);
  }
}

async function* iterateSafely(
  iterable: AsyncIterable<unknown>,
): AsyncGenerator<SafeResult<unknown, unknown>, void> {
  const iterator = iterable[Symbol.asyncIterator]();
  let done = false;
  try {
    for (;;) {
      let step: IteratorResult<unknown>;
      try {
        step = await iterator.next();
      } catch (cause) {
        done = true;
        yield failed(cause);
        return;
      }
      if (step.done) {
        done = true;
        return;
      }
      yield succeeded(step.value);
    }
  } finally {
    // The loop was left early (`break`): close the source, as `for await` would.
    if (!done) await iterator.return?.();
  }
}

/**
 * A client whose queries and mutations resolve to `safe()` results.
 * @since 0.1.0
 * @stability stable
 */
export type SafeClient<TClient> = {
  [K in keyof TClient]: TClient[K] extends (
    ...args: infer A
  ) => TrpcPromise<infer T, infer E>
    ? (...args: A) => Promise<SafeResult<T, E>>
    : TClient[K] extends (...args: any[]) => any
      ? TClient[K]
      : SafeClient<TClient[K]>;
};

/**
 * Wraps a client so every query and mutation returns a `safe()` result.
 *
 * @example
 * ```ts
 * const safeClient = createSafeClient(client);
 * const [post, error] = await safeClient.post.byId.query({ id });
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function createSafeClient<TClient extends object>(
  client: TClient,
): SafeClient<TClient> {
  return createRecursiveProxy((path, args) => {
    let target: any = client;
    for (const key of path) target = target[key];
    const method = path.at(-1);
    const result = target(...args);
    return method === 'query' || method === 'mutate' ? safe(result) : result;
  });
}

/** The errors with a key of their own: the defined ones and the links'. */
type Keyed = { readonly defined: true } | { readonly code: LinkErrorCode };
type KeyedOf<E extends AnyTrpcError> = Extract<E, Keyed>;
type UnexpectedOf<E> = Exclude<E, Keyed>;

/**
 * The handlers {@link matchError} takes for errors `E`, all required: one
 * per defined code and one per code the client's links declare
 * (`NETWORK_ERROR`, `BAD_RESPONSE`, `STREAM_INTERRUPTED`), each getting
 * that error; and `unexpected`, which gets every other one: built-in codes
 * nothing declared (a crash, an abort, a proxy's status, a procedure the
 * server lacks) and undeclared errors. Once no other error is left,
 * `unexpected` is a type error too.
 * @since 0.1.0
 * @stability stable
 */
export type ErrorHandlers<E extends AnyTrpcError> = {
  // Members sharing a code map to one key, whose handler gets their union.
  readonly [K in KeyedOf<E> as K['code']]: (err: K) => unknown;
} & ([UnexpectedOf<E>] extends [never]
  ? {}
  : { readonly unexpected: (err: UnexpectedOf<E>) => unknown });

/**
 * A type error naming each of `matchError()`'s keys that no error of the
 * call goes to. Over the keys alone, so it's cached when there are none.
 */
type LeftoverKeys<K extends PropertyKey> = {
  [P in K]: `'${P & string}' handles no error of this call`;
};

/**
 * {@link LeftoverKeys} of `K` that aren't `Known`. `unknown` when there are
 * none, so the usual call's constraint is `ErrorHandlers<E>` alone; `{}`
 * keeps the intersection, and with it the cost (`pnpm bench shapes`, `match`).
 */
type Leftover<K extends PropertyKey, Known> = [K] extends [Known]
  ? unknown
  : LeftoverKeys<Exclude<K, Known>>;

type HandlerResult<H> = H[keyof H] extends (err: never) => infer R ? R : never;

/**
 * Handles every error a call can fail with, or fails to compile: each
 * defined code and each code the links declare needs its handler, and
 * `unexpected` takes the rest. Returns what the handler returns.
 *
 * @example
 * ```ts
 * const [post, err] = await safe(client.post.create.mutate({ title }));
 * if (err) {
 *   return matchError(err, {
 *     BAD_REQUEST: (e) => e.data.issues.map((issue) => issue.message),
 *     TITLE_TAKEN: (e) => [`"${e.data.title}" is taken`],
 *     NETWORK_ERROR: () => ['You are offline'],
 *     BAD_RESPONSE: () => ['Try again later'],
 *     unexpected: (e) => [e.message],
 *   });
 * }
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function matchError<
  E extends AnyTrpcError,
  H extends ErrorHandlers<E> & Leftover<keyof H, keyof ErrorHandlers<E>>,
>(err: E, handlers: H): HandlerResult<H> {
  const table = handlers as unknown as Record<
    string,
    ((err: E) => HandlerResult<H>) | undefined
  >;
  const own = (key: string) =>
    Object.hasOwn(table, key) ? table[key] : undefined;
  const { code } = err;
  const keyed =
    err.defined ||
    (isBuiltinCode(code) &&
      ERROR_STATUS[code] === 0 &&
      code !== 'CLIENT_ERROR');
  const handler = (keyed ? own(code) : undefined) ?? own('unexpected');
  if (!handler) throw err;
  return handler(err);
}
