import { Effect, Exit } from 'effect';
import {
  ERROR_CATEGORY,
  ERROR_STATUS,
  frameworkError,
  hasDigest,
  isBuiltinCode,
  TrpcError,
  type AnyTrpcError,
  type CategoryCode,
  type ErrorCategory,
} from '../internal/error.ts';
import type { ProcedureType } from '../internal/types.ts';
import type { AnySerializer } from '../serializer/index.ts';
import {
  chainSerializer,
  chainSubscriptionIterator,
  chainSwitchNames,
  clientErrorFromCause,
  firstValue,
  runLinks,
  type Operation,
  type AnyLink,
  type BuiltinCallOptions,
  type TrpcLink,
} from './link.ts';
import type {
  DuplicateSwitchCheck,
  LinksContext,
  LinksTypes,
  RouterOf,
  SubscribeOptions,
  TrpcClient,
  LinkErrorCode,
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
  links: ReadonlyArray<AnyLink>;
}

/**
 * Options for a client typed from a `router:` value (17 D-C).
 * @since 0.1.0
 * @stability stable
 */
export interface TypedClientOptions<
  TSource,
  TLinks extends ReadonlyArray<TrpcLink<any, RouterOf<TSource>>>,
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
  const iterate = chainSubscriptionIterator(links);
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
          if (!iterate) {
            const error = new TrpcError({
              code: 'CLIENT_ERROR',
              message:
                'No link on this chain carries subscriptions; wrap a custom one in withSubscriptions()',
            });
            return { next: () => Promise.reject(error) };
          }
          const op = makeOperation('subscription', o.path, o.input, o);
          return iterate(runLinks(links, op), op.signal)[
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
 * router-aware links like `splitLink` see typed paths.
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
  const TLinks extends ReadonlyArray<TrpcLink<any, RouterOf<TSource>>>,
>(
  opts: TypedClientOptions<TSource, TLinks> &
    DuplicateSwitchCheck<TLinks> &
    UnmetNeedCheck<TLinks>,
): TrpcClient<
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
 * ```
 * @since 0.1.0
 * @stability stable
 */
export async function safe<T, E = unknown>(
  promise: PromiseLike<T> & { readonly '~error'?: E },
): Promise<SafeResult<T, E>> {
  try {
    const data = await promise;
    return Object.assign([data, undefined] as [T, undefined], {
      data,
      error: undefined,
    });
  } catch (cause) {
    if (hasDigest(cause)) throw cause;
    const error = cause as E;
    return Object.assign([undefined, error] as [undefined, E], {
      data: undefined,
      error,
    });
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

type DefinedOf<E> = Extract<E, { readonly defined: true }>;
type BuiltinOf<E> = Exclude<E, { readonly defined: true }>;
type LinkOf<E> = Extract<BuiltinOf<E>, { readonly code: LinkErrorCode }>;
type CodeOf<E> = E extends { readonly code: infer C extends string }
  ? C
  : never;

/** The built-in errors left for the categories: those no key in `TKeys` takes. */
type RestOf<E, TKeys> = Exclude<
  BuiltinOf<E>,
  { readonly code: TKeys & LinkErrorCode }
>;

type CategoriesOf<R> = {
  [K in ErrorCategory]: [
    Extract<R, { readonly code: CategoryCode<K> }>,
  ] extends [never]
    ? never
    : K;
}[ErrorCategory];

type CategoryHandlers<R> = {
  readonly [K in CategoriesOf<R>]: (
    err: Extract<R, { readonly code: CategoryCode<K> }>,
  ) => unknown;
};

type BuiltinHandlers<R> = [R] extends [never]
  ? { readonly builtin?: never }
  :
      | (CategoryHandlers<R> & { readonly builtin?: never })
      | (Partial<CategoryHandlers<R>> & {
          readonly builtin: (err: R) => unknown;
        });

/**
 * The handlers {@link matchError} takes for errors `E`: one per defined
 * code, each getting that error; optionally one per code a link declares
 * (`NETWORK_ERROR`, `BAD_RESPONSE`, `STREAM_INTERRUPTED`), which takes it
 * from its category; and one per category of the built-in errors left
 * (`rejected`, `unavailable`, `failed`, `aborted`, see `ERROR_CATEGORY`),
 * each getting that category's codes. `builtin` takes the categories not
 * listed; once no built-in error is left, both are type errors. `TKeys`
 * are the keys given, which take their codes from the categories.
 * @since 0.1.0
 * @stability stable
 */
export type ErrorHandlers<E, TKeys = never> = {
  readonly [C in CodeOf<DefinedOf<E>>]: (
    err: Extract<DefinedOf<E> | LinkOf<E>, { readonly code: C }>,
  ) => unknown;
} & {
  readonly [C in Exclude<CodeOf<LinkOf<E>>, CodeOf<DefinedOf<E>>>]?: (
    err: Extract<LinkOf<E>, { readonly code: C }>,
  ) => unknown;
} & BuiltinHandlers<RestOf<E, TKeys>>;

type HandlerKey<E, TKeys> =
  | CodeOf<DefinedOf<E>>
  | CodeOf<LinkOf<E>>
  | ([RestOf<E, TKeys>] extends [never]
      ? never
      : CategoriesOf<RestOf<E, TKeys>> | 'builtin');

type HandlerResult<H> = {
  [K in keyof H]-?: H[K] extends (err: never) => infer R ? R : never;
}[keyof H];

/**
 * Handles every error a call can fail with, or fails to compile: each
 * defined code needs its handler, and `builtin` takes the rest. Returns
 * what the handler returns.
 *
 * @example
 * ```ts
 * const [post, err] = await safe(client.post.create.mutate({ title }));
 * if (err) {
 *   return matchError(err, {
 *     BAD_REQUEST: (e) => e.data.issues.map((issue) => issue.message),
 *     TITLE_TAKEN: (e) => [`"${e.data.title}" is taken`],
 *     builtin: (e) =>
 *       e.code === 'NETWORK_ERROR' ? ['You are offline'] : [e.message],
 *   });
 * }
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function matchError<
  E extends AnyTrpcError,
  H extends ErrorHandlers<E, keyof H> & {
    readonly [K in keyof H]: K extends HandlerKey<E, keyof H> ? unknown : never;
  },
>(err: E, handlers: H): HandlerResult<H> {
  const table = handlers as unknown as Record<
    string,
    ((err: E) => HandlerResult<H>) | undefined
  >;
  const own = (key: string | false) =>
    key && Object.hasOwn(table, key) ? table[key] : undefined;
  const { code } = err;
  const builtin = isBuiltinCode(code);
  const handler =
    (err.defined
      ? own(code)
      : (builtin &&
          ERROR_STATUS[code] === 0 &&
          code !== 'CLIENT_ERROR' &&
          own(code)) ||
        own(builtin && ERROR_CATEGORY[code])) ?? table['builtin'];
  if (!handler) throw err;
  return handler(err);
}
