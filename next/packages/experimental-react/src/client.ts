import {
  createTrpcClient,
  type LinksContext,
  type LinksTypes,
  type RouterOf,
  type TrpcClient,
  type TrpcLink,
  type TrpcPromise,
  type TypedClientOptions,
} from '@trpc12/trpc/client';
import {
  createStore,
  queryKey,
  type QueryFilter,
  type QueryStore,
} from './store.ts';
import type { Thenable } from './thenable.ts';

/**
 * What `.query()` returns: a promise `use()` reads, the same object for the
 * same query until its data changes, and already settled once there is
 * data, so `use()` only suspends while there is nothing to show.
 * @since 0.1.0
 * @stability experimental
 */
export type QueryPromise<T, E = unknown> = TrpcPromise<T, E> & Thenable<T>;

/**
 * A query procedure on the React client.
 * @since 0.1.0
 * @stability experimental
 */
export interface DecorateQuery<TArgs extends readonly unknown[], T, E> {
  /**
   * Starts the query, or joins the request in flight, and returns its
   * promise. Call it where data loads (a route loader, an event handler),
   * and read the promise with `useQuery` and `use()`. Fresh cached data
   * makes no request; stale data is returned and refetched in the
   * background. Call options apply to the request this call starts; a
   * shared request ignores `signal`.
   */
  query(...args: TArgs): QueryPromise<T, E>;
  /** Marks the query stale (every input when omitted) and refetches the read ones. */
  invalidate(input?: TArgs[0]): Promise<void>;
  /** Writes the query's data. Readers re-render without suspending. */
  setData(input: TArgs[0], updater: T | ((prev: T | undefined) => T)): void;
  /** The cached data, or `undefined`. */
  getData(
    ...input: undefined extends TArgs[0] ? [input?: TArgs[0]] : [TArgs[0]]
  ): T | undefined;
}

/**
 * The React client's procedure tree: queries get the cache's methods,
 * mutations and subscriptions are the plain client's.
 * @since 0.1.0
 * @stability experimental
 */
export type ReactProcedures<C> = {
  [K in keyof C as K extends string ? K : never]: C[K] extends {
    query(...args: infer A): TrpcPromise<infer T, infer E>;
  }
    ? DecorateQuery<A, T, E>
    : C[K] extends { mutate: unknown } | { subscribe: unknown }
      ? C[K]
      : ReactProcedures<C[K]>;
};

/**
 * What {@link createReactClient} returns.
 * @since 0.1.0
 * @stability experimental
 */
export type ReactClient<TClient> = ReactProcedures<TClient> & {
  /** The plain client, on the same links. Its queries skip the cache. */
  readonly client: TClient;
  /** The cache. */
  readonly store: QueryStore;
  /**
   * Marks queries stale and refetches the read ones; resolves when they
   * settle. Takes a path prefix (`'post'`) or a predicate; all by default.
   */
  invalidate(filter?: QueryFilter): Promise<void>;
};

/**
 * Options for {@link createReactClient}.
 * @since 0.1.0
 * @stability experimental
 */
export type ReactClientOptions<
  TSource,
  TLinks extends ReadonlyArray<TrpcLink<any, RouterOf<TSource>>>,
> = TypedClientOptions<TSource, TLinks> & {
  /**
   * A server's store keeps every entry for the client's life: create one
   * client per request there.
   * @default typeof window === 'undefined'
   */
  isServer?: boolean | undefined;
};

const at = (node: unknown, path: readonly string[]): any =>
  path.reduce((current: any, segment) => current[segment], node);

/**
 * Creates a React client: a tRPC client whose queries return stable,
 * `use()`-ready promises from a cache. Loaders start queries; components
 * read them with {@link useQuery} and `use()`. The cache does the least on
 * its own: one promise and one request per query in flight, and entries
 * only while something reads them. Links add the rest (`standardLinks()`
 * for TanStack Query's defaults).
 *
 * @example
 * ```ts
 * export const trpc = createReactClient({
 *   router: routerType<AppRouter>(),
 *   links: [...standardLinks(), httpLink({ url: '/trpc' })],
 * });
 *
 * // a route loader
 * loader: ({ params }) => ({ post: trpc.post.byId.query({ id: params.id }) }),
 *
 * // its component
 * const post = use(useQuery(loaderData.post));
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function createReactClient<
  TSource,
  const TLinks extends ReadonlyArray<TrpcLink<any, RouterOf<TSource>>>,
>(
  opts: ReactClientOptions<TSource, TLinks>,
): ReactClient<
  TrpcClient<
    RouterOf<TSource>,
    LinksContext<TLinks>,
    undefined,
    LinksTypes<TLinks>
  >
>;
export function createReactClient(opts: {
  router: unknown;
  links: ReadonlyArray<TrpcLink<any, any>>;
  isServer?: boolean | undefined;
}): unknown {
  const client = createTrpcClient(opts);
  const store = createStore({
    links: opts.links,
    isServer: opts.isServer ?? typeof window === 'undefined',
    request: (path, input, callOptions, signal) =>
      at(client, path.split('.')).query(input, { ...callOptions, signal }),
  });
  const dataOf = (path: string, input: unknown) => store.get(path, input)?.data;
  const method = (path: readonly string[], args: unknown[]): unknown => {
    const name = path.at(-1);
    const procedure = path.slice(0, -1).join('.');
    switch (name) {
      case 'query': {
        const { signal: _signal, ...callOptions } = (args[1] ?? {}) as {
          signal?: AbortSignal;
        };
        return store.read(procedure, args[0], callOptions);
      }
      case 'invalidate': {
        if (path.length === 1) return store.invalidate(args[0] as QueryFilter);
        const key =
          args[0] === undefined ? undefined : queryKey(procedure, args[0]);
        return store.invalidate((entry) =>
          key === undefined ? entry.path === procedure : entry.key === key,
        );
      }
      case 'setData': {
        const [input, updater] = args;
        const next =
          typeof updater === 'function'
            ? updater(dataOf(procedure, input))
            : updater;
        store.setData(procedure, input, next);
        return undefined;
      }
      case 'getData':
        return dataOf(procedure, args[0]);
      default:
        return at(client, path)(...args);
    }
  };
  const proxy = (path: readonly string[]): any =>
    new Proxy((...args: unknown[]) => method(path, args), {
      get(_target, key) {
        if (typeof key !== 'string' || key === 'then') return undefined;
        if (path.length === 0 && key === 'client') return client;
        if (path.length === 0 && key === 'store') return store;
        return proxy([...path, key]);
      },
    });
  return proxy([]);
}
