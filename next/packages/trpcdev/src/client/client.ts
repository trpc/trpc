import { Effect, Exit, Stream } from 'effect';
import { frameworkError } from '../internal/error.ts';
import type { ProcedureType } from '../internal/types.ts';
import type { AnySerializer } from '../serializer/index.ts';
import {
  chainSerializer,
  chainSwitchNames,
  clientErrorFromCause,
  firstValue,
  runLinks,
  type Operation,
  type AnyLink,
  type OperationStream,
  type TrpcClientContext,
  type TrpcLink,
} from './link.ts';
import type {
  DuplicateSwitchCheck,
  LinksContext,
  RouterOf,
  SubscribeOptions,
  TrpcClient,
  TrpcPromise,
} from './types.ts';

/**
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function createRecursiveProxy(
  callback: (path: readonly string[], args: unknown[]) => unknown,
  path: readonly string[] = [],
): any {
  return new Proxy(() => {}, {
    get(_target, key) {
      if (typeof key !== 'string' || key === 'then') return undefined;
      return createRecursiveProxy(callback, [...path, key]);
    },
    apply(_target, _this, args: unknown[]) {
      return callback(path, args);
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
 * @since 12.0.0-alpha.0
 * @stability experimental
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
 * @since 12.0.0-alpha.0
 * @stability experimental
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
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface UntypedCallOptions {
  signal?: AbortSignal | undefined;
  context?: TrpcClientContext | undefined;
  /** Subscriptions: resume after this event id. */
  lastEventId?: string | undefined;
}

/** Interrupts `stream` quietly when `signal` aborts. @internal */
export function untilAborted(
  stream: OperationStream,
  signal: AbortSignal | undefined,
): OperationStream {
  if (!signal) return stream;
  return Stream.interruptWhen(
    stream,
    Effect.callback<void>((resume) => {
      if (signal.aborted) return resume(Effect.void);
      const onAbort = () => resume(Effect.void);
      signal.addEventListener('abort', onAbort, { once: true });
      return Effect.sync(() => signal.removeEventListener('abort', onAbort));
    }),
  );
}

/**
 * Options for {@link createTrpcClient}.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface TrpcClientOptions {
  /** The request chain. The last link sends the request. */
  links: ReadonlyArray<AnyLink>;
}

/**
 * Options for a client typed from a `router:` value (17 D-C).
 * @since 12.0.0-alpha.0
 * @stability experimental
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
 * @since 12.0.0-alpha.0
 * @stability experimental
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
 * @since 12.0.0-alpha.0
 * @stability experimental
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
          return Stream.toAsyncIterable(
            untilAborted(runLinks(links, op), op.signal),
          )[Symbol.asyncIterator]();
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
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function createTrpcClient<
  TSource,
  const TLinks extends ReadonlyArray<TrpcLink<any, RouterOf<TSource>>>,
>(
  opts: TypedClientOptions<TSource, TLinks> & DuplicateSwitchCheck<TLinks>,
): TrpcClient<RouterOf<TSource>, LinksContext<TLinks>>;
/**
 * Creates a typed client from an explicit router type. Link fields on the
 * call options come from the open {@link TrpcClientContext} interface.
 *
 * @example
 * ```ts
 * const client = createTrpcClient<AppRouter>({ links: [httpLink({ url })] });
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function createTrpcClient<TRouter>(
  opts: TrpcClientOptions,
): TrpcClient<TRouter>;
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
 * const serializer = getClientSerializer(client) ?? defaultSerializer;
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function getClientSerializer(client: object): AnySerializer | undefined {
  return clientSerializers.get(client);
}

/**
 * The result of `safe()`: a `[data, error]` tuple that also has `data` and
 * `error` properties (07 Q7.3).
 * @since 12.0.0-alpha.0
 * @stability experimental
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
 * Awaits a call without throwing.
 *
 * @example
 * ```ts
 * const [post, error] = await safe(client.post.byId.query({ id }));
 * if (error?.defined && error.code === 'NOT_FOUND') error.data.id; // typed
 *
 * const { data, error } = await safe(client.post.create.mutate(input));
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
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
    const error = cause as E;
    return Object.assign([undefined, error] as [undefined, E], {
      data: undefined,
      error,
    });
  }
}

/**
 * A client whose queries and mutations resolve to `safe()` results.
 * @since 12.0.0-alpha.0
 * @stability experimental
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
 * @since 12.0.0-alpha.0
 * @stability experimental
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
