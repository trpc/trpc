import type { QueryClient } from '@tanstack/react-query';
import type { TRPCClient } from '@trpc/client';
import { getUntypedClient, TRPCUntypedClient } from '@trpc/client';
import type { AnyTRPCRouter, inferRouterContext } from '@trpc/server';
import { callTRPCProcedure, createTRPCRecursiveProxy } from '@trpc/server';
import {
  isFunction,
  type MaybePromise,
} from '@trpc/server/unstable-core-do-not-import';
import { getMutationKeyInternal } from '../shared/mutationKey';
import type { QueryCall, TRPCQueryBaseOptions } from '../shared/queryFn';
import {
  createInfiniteQueryFn,
  createQueryFn,
  createTRPCOptionsResult,
} from '../shared/queryFn';
import { getQueryKeyInternal } from '../shared/queryKey';
import type {
  TRPCHandleFeatureFlags,
  TRPCHandleProxy,
  TRPCLoaderProxy,
} from './types';

/**
 * @internal
 */
export type KeyPrefixOptions<TFeatureFlags extends TRPCHandleFeatureFlags> =
  TFeatureFlags['keyPrefix'] extends true
    ? { keyPrefix: string }
    : {
        /** To use a query key prefix, set `keyPrefix: true` in the feature flags */
        keyPrefix?: never;
      };

/**
 * Options for {@link createTRPCLoaderProxy}. Pass either `client`, or
 * `router` and `ctx`.
 */
export type TRPCLoaderProxyOptions<
  TRouter extends AnyTRPCRouter,
  TFeatureFlags extends TRPCHandleFeatureFlags = { keyPrefix: false },
> = {
  /** The `QueryClient`, or a function that returns it */
  queryClient: QueryClient | (() => QueryClient);
} & KeyPrefixOptions<TFeatureFlags> &
  (
    | {
        /** The router to call, on the server */
        router: TRouter;
        /** The context for each call, or a function that returns it */
        ctx:
          | inferRouterContext<TRouter>
          | (() => MaybePromise<inferRouterContext<TRouter>>);
      }
    | {
        /** The tRPC client to call procedures with */
        client: TRPCUntypedClient<TRouter> | TRPCClient<TRouter>;
      }
  );

function unwrapLazyArg<T>(valueOrLazy: T | (() => T)): T {
  return (isFunction(valueOrLazy) ? valueOrLazy() : valueOrLazy) as T;
}

type AnyClient = TRPCUntypedClient<AnyTRPCRouter> | TRPCClient<AnyTRPCRouter>;

type MutationCall = typeof TRPCUntypedClient.prototype.mutation;

function untypedClientOf(client: AnyClient) {
  return client instanceof TRPCUntypedClient
    ? client
    : getUntypedClient(client);
}

function clientCall(client: AnyClient): QueryCall {
  const untypedClient = untypedClientOf(client);
  return (path, input, opts) => untypedClient.query(path, input, opts);
}

function clientMutate(client: AnyClient): MutationCall {
  const untypedClient = untypedClientOf(client);
  return (path, input, opts) => untypedClient.mutation(path, input, opts);
}

function routerCall(router: AnyTRPCRouter, ctx: unknown): QueryCall {
  return (path, input) =>
    Promise.resolve(unwrapLazyArg(ctx)).then((resolvedCtx) =>
      callTRPCProcedure({
        router,
        path,
        getRawInput: async () => input,
        ctx: resolvedCtx,
        type: 'query',
        signal: undefined,
        batchIndex: 0,
      }),
    ) as ReturnType<QueryCall>;
}

type HandleUtil =
  | '~queryClient'
  | 'pathKey'
  | 'queryKey'
  | 'infiniteQueryKey'
  | 'queryOptions'
  | 'infiniteQueryOptions'
  | 'mutationKey'
  | 'mutationOptions';

type HandleOptionsIn = TRPCQueryBaseOptions & {
  initialCursor?: unknown;
} & Record<string, unknown>;

/**
 * Creates a handle proxy. It has what the handle functions read: the keys,
 * `queryOptions`, `infiniteQueryOptions` and `~queryClient`. With `mutate`,
 * it also has `mutationKey` and `mutationOptions`.
 * @internal
 */
export function createHandleProxy(opts: {
  call: QueryCall;
  mutate: MutationCall | null;
  queryClient: QueryClient | (() => QueryClient);
  prefix: string | undefined;
}): object {
  const { call, mutate, prefix } = opts;
  return createTRPCRecursiveProxy(({ args, path: _path }) => {
    const path = [..._path];
    const util = path.pop() as HandleUtil;
    const [input, options] = args as [unknown, HandleOptionsIn | undefined];
    switch (util) {
      case '~queryClient':
        return unwrapLazyArg(opts.queryClient);
      case 'pathKey':
        return getQueryKeyInternal({ path, type: 'any', prefix });
      case 'queryKey':
        return getQueryKeyInternal({ path, input, type: 'query', prefix });
      case 'infiniteQueryKey':
        return getQueryKeyInternal({ path, input, type: 'infinite', prefix });
      case 'queryOptions': {
        const queryKey = getQueryKeyInternal({
          path,
          input,
          type: 'query',
          prefix,
        });
        return {
          ...options,
          queryKey,
          queryFn: createQueryFn({
            query: call,
            queryClient: unwrapLazyArg(opts.queryClient),
            trpc: options?.trpc,
          }),
          trpc: createTRPCOptionsResult({ path }),
        };
      }
      case 'infiniteQueryOptions': {
        const queryKey = getQueryKeyInternal({
          path,
          input,
          type: 'infinite',
          prefix,
        });
        return {
          ...options,
          queryKey,
          queryFn: createInfiniteQueryFn({
            query: call,
            queryKey,
            trpc: options?.trpc,
          }),
          initialPageParam:
            options?.initialCursor ??
            (input as { cursor?: unknown } | undefined)?.cursor,
          trpc: createTRPCOptionsResult({ path }),
        };
      }
      case 'mutationKey':
        return getMutationKeyInternal({ path, prefix });
      case 'mutationOptions': {
        if (mutate) {
          const mutationOpts = input as TRPCQueryBaseOptions | undefined;
          const mutationKey = getMutationKeyInternal({ path, prefix });
          return {
            ...mutationOpts,
            mutationKey,
            mutationFn: (variables: unknown) =>
              mutate(path.join('.'), variables, mutationOpts?.trpc),
            trpc: createTRPCOptionsResult({ path }),
          };
        }
        break;
      }
    }
    throw new TypeError(
      `\`trpc.${[...path, util].join('.')}()\` isn't on this handle proxy. It has \`queryKey\`, \`infiniteQueryKey\` and \`pathKey\`, and reads handles with \`fromHandle\`. Mutations are on \`useTRPCHandles()\``,
    );
  });
}

/**
 * Marks every level of a loader proxy. A tRPC proxy returns `undefined` for
 * symbol keys, so other proxies don't have it.
 */
const loaderProxy = Symbol('trpc.loaderProxy');

function markLoader(target: object): object {
  return new Proxy(target, {
    get(proxy, key) {
      if (key === loaderProxy) {
        return true;
      }
      const value: unknown = Reflect.get(proxy, key);
      return typeof value === 'function' ? markLoader(value) : value;
    },
  });
}

/**
 * @internal
 */
export function isLoaderProxy(proxy: object) {
  return (proxy as { [loaderProxy]?: true })[loaderProxy] === true;
}

/**
 * Creates a proxy that loads handles with `loadHandles`. Use it where
 * queries can be waited for: a route loader, a server component,
 * `getServerSideProps`. It has the router's queries and their keys, and
 * nothing from `useTRPC()`.
 *
 * @example
 * ```ts
 * export const trpc = createTRPCLoaderProxy<AppRouter>({
 *   client: trpcClient,
 *   queryClient,
 * });
 * ```
 * @see https://trpc.io/docs/client/tanstack-react-query/handles
 */
export function createTRPCLoaderProxy<
  TRouter extends AnyTRPCRouter,
  TFeatureFlags extends TRPCHandleFeatureFlags = { keyPrefix: false },
>(
  opts: TRPCLoaderProxyOptions<TRouter, TFeatureFlags>,
): TRPCLoaderProxy<TRouter, TFeatureFlags> {
  return markLoader(
    createHandleProxy({
      call:
        'router' in opts
          ? routerCall(opts.router, opts.ctx)
          : clientCall(opts.client),
      mutate: null,
      queryClient: opts.queryClient,
      prefix: opts.keyPrefix,
    }),
  ) as TRPCLoaderProxy<TRouter, TFeatureFlags>;
}

/**
 * @internal
 */
export function createRenderProxy<
  TRouter extends AnyTRPCRouter,
  TFeatureFlags extends TRPCHandleFeatureFlags,
>(opts: {
  client: TRPCClient<TRouter>;
  queryClient: QueryClient;
  prefix: string | undefined;
}) {
  return createHandleProxy({
    call: clientCall(opts.client),
    mutate: clientMutate(opts.client),
    queryClient: opts.queryClient,
    prefix: opts.prefix,
  }) as TRPCHandleProxy<TRouter, TFeatureFlags>;
}
