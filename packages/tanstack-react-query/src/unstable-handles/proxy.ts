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
import type { TRPCHandleFeatureFlags, TRPCHandleProxy } from './types';

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
 * Options for {@link createTRPCHandleProxy}. Pass either `client`, or
 * `router` and `ctx`.
 */
export type TRPCHandleProxyOptions<
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

function routerCall(
  router: AnyTRPCRouter,
  ctx: unknown,
  type: 'query' | 'mutation',
) {
  return ((path, input) =>
    Promise.resolve(unwrapLazyArg(ctx)).then((resolvedCtx) =>
      callTRPCProcedure({
        router,
        path,
        getRawInput: async () => input,
        ctx: resolvedCtx,
        type,
        signal: undefined,
        batchIndex: 0,
      }),
    )) as QueryCall & MutationCall;
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
 * Creates a handle proxy: the router's queries and mutations, and their keys.
 * Pass it to `loadHandles` where queries can be waited for, such as a route
 * loader, a server component or `getServerSideProps`. In components, use
 * `useTRPCHandles()` from {@link createTRPCHandleContext}.
 *
 * @example
 * ```ts
 * export const trpc = createTRPCHandleProxy<AppRouter>({
 *   client: trpcClient,
 *   queryClient,
 * });
 * ```
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#standalone
 */
export function createTRPCHandleProxy<
  TRouter extends AnyTRPCRouter,
  TFeatureFlags extends TRPCHandleFeatureFlags = { keyPrefix: false },
>(
  opts: TRPCHandleProxyOptions<TRouter, TFeatureFlags>,
): TRPCHandleProxy<TRouter, TFeatureFlags> {
  const { keyPrefix: prefix } = opts;
  const call: QueryCall =
    'router' in opts
      ? routerCall(opts.router, opts.ctx, 'query')
      : clientCall(opts.client);
  const mutate: MutationCall =
    'router' in opts
      ? routerCall(opts.router, opts.ctx, 'mutation')
      : clientMutate(opts.client);
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
        const mutationOpts = input as TRPCQueryBaseOptions | undefined;
        return {
          ...mutationOpts,
          mutationKey: getMutationKeyInternal({ path, prefix }),
          mutationFn: (variables: unknown) =>
            mutate(path.join('.'), variables, mutationOpts?.trpc),
          trpc: createTRPCOptionsResult({ path }),
        };
      }
    }
    throw new TypeError(
      `\`trpc.${[...path, util].join('.')}()\` isn't on a handle proxy. It has \`queryOptions\`, \`infiniteQueryOptions\`, \`mutationOptions\` and their keys`,
    );
  }) as TRPCHandleProxy<TRouter, TFeatureFlags>;
}
