import type { DataTag, QueryClient, QueryFilters } from '@tanstack/react-query';
import type { TRPCClient, TRPCRequestOptions } from '@trpc/client';
import { getUntypedClient, TRPCUntypedClient } from '@trpc/client';
import type {
  AnyTRPCProcedure,
  AnyTRPCRootTypes,
  AnyTRPCRouter,
  inferProcedureInput,
  inferRouterContext,
  inferTransformedProcedureOutput,
  TRPCProcedureType,
  TRPCRouterRecord,
} from '@trpc/server';
import { callTRPCProcedure, createTRPCRecursiveProxy } from '@trpc/server';
import type { MaybePromise } from '@trpc/server/unstable-core-do-not-import';
import {
  trpcInfiniteQueryOptions,
  type TRPCInfiniteQueryOptions,
} from './infiniteQueryOptions';
import type { MutationOptionsOverride } from './mutationOptions';
import {
  trpcMutationOptions,
  type TRPCMutationOptions,
} from './mutationOptions';
import { trpcQueryOptions, type TRPCQueryOptions } from './queryOptions';
import {
  trpcSubscriptionOptions,
  type TRPCSubscriptionOptions,
} from './subscriptionOptions';
import type { ResolverDef, TRPCMutationKey, TRPCQueryKey } from './types';
import {
  getMutationKeyInternal,
  getQueryKeyInternal,
  unwrapLazyArg,
} from './utils';

export interface DecorateRouterKeyable {
  /**
   * Calculate the TanStack Query Key for a Route, could be used to invalidate every procedure beneath this route
   *
   * @see https://tanstack.com/query/latest/docs/framework/react/guides/query-keys
   * @see https://trpc.io/docs/client/tanstack-react-query/usage#queryKey
   */
  routeKey: () => TRPCQueryKey;

  /**
   * Calculate a TanStack Query Filter for a Route, could be used to manipulate every procedure beneath this route
   *
   * @see https://tanstack.com/query/latest/docs/framework/react/guides/filters
   * @see https://trpc.io/docs/client/tanstack-react-query/usage#queryFilter
   */
  routeFilter: (filters?: QueryFilters) => QueryFilters;
}

export type inferInput<
  TProcedure extends
    | DecorateQueryProcedure<any>
    | DecorateMutationProcedure<any>,
> = TProcedure['~types']['input'];

export type inferOutput<
  TProcedure extends
    | DecorateQueryProcedure<any>
    | DecorateMutationProcedure<any>,
> = TProcedure['~types']['output'];

export interface DecorateQueryProcedure<TDef extends ResolverDef>
  extends DecorateRouterKeyable {
  /**
   * @internal prefer using inferInput and inferOutput to access types
   */
  '~types': {
    input: TDef['input'];
    output: TDef['output'];
    errorShape: TDef['errorShape'];
  };

  /**
   * Create a set of type-safe query options that can be passed to `useQuery`, `prefetchQuery` etc.
   *
   * @see https://tanstack.com/query/latest/docs/framework/react/reference/queryOptions#queryoptions
   * @see https://trpc.io/docs/client/tanstack-react-query/usage#queryOptions
   */
  queryOptions: TRPCQueryOptions<TDef>;

  /**
   * Calculate the TanStack Query Key for a Infinite Query Procedure
   *
   * @see https://tanstack.com/query/latest/docs/framework/react/guides/query-keys
   * @see https://trpc.io/docs/client/tanstack-react-query/usage#queryKey
   */
  infiniteQueryKey: (
    input?: TDef['input'],
  ) => DataTag<TRPCQueryKey, TDef['output'], TDef['errorShape']>;

  /**
   * Create a set of type-safe infinite query options that can be passed to `useInfiniteQuery`, `prefetchInfiniteQuery` etc.
   *
   * @see https://tanstack.com/query/latest/docs/framework/react/reference/infiniteQueryOptions#infinitequeryoptions
   * @see https://trpc.io/docs/client/tanstack-react-query/usage#infiniteQueryOptions
   */
  infiniteQueryOptions: TRPCInfiniteQueryOptions<TDef>;

  /**
   * Calculate a TanStack Query Filter for a Infinite Query Procedure
   *
   * @see https://tanstack.com/query/latest/docs/framework/react/guides/filters
   * @see https://trpc.io/docs/client/tanstack-react-query/usage#queryFilter
   */
  infiniteQueryFilter: (
    input?: TDef['input'],
    filters?: QueryFilters<TDef['output'], TDef['errorShape']>,
  ) => QueryFilters<
    TDef['output'],
    TDef['errorShape'],
    TDef['output'],
    DataTag<TRPCQueryKey, TDef['output'], TDef['errorShape']>
  >;

  /**
   * Calculate the TanStack Query Key for a Query Procedure
   *
   * @see https://tanstack.com/query/latest/docs/framework/react/guides/query-keys
   * @see https://trpc.io/docs/client/tanstack-react-query/usage#queryKey
   */
  queryKey: (
    input?: TDef['input'],
  ) => DataTag<TRPCQueryKey, TDef['output'], TDef['errorShape']>;

  /**
   * Calculate a TanStack Query Filter for a Query Procedure
   *
   * @see https://tanstack.com/query/latest/docs/framework/react/guides/filters
   * @see https://trpc.io/docs/client/tanstack-react-query/usage#queryFilter
   */
  queryFilter: (
    input?: TDef['input'],
    filters?: QueryFilters<TDef['output'], TDef['errorShape']>,
  ) => QueryFilters<
    TDef['output'],
    TDef['errorShape'],
    TDef['output'],
    DataTag<TRPCQueryKey, TDef['output'], TDef['errorShape']>
  >;
}

export interface DecorateMutationProcedure<TDef extends ResolverDef> {
  /**
   * @internal prefer using inferInput and inferOutput to access types
   */
  '~types': {
    input: TDef['input'];
    output: TDef['output'];
  };

  /**
   * Create a set of type-safe mutation options that can be passed to `useMutation`
   *
   * @see https://trpc.io/docs/client/tanstack-react-query/usage#mutationOptions
   */
  mutationOptions: TRPCMutationOptions<TDef>;

  /**
   * Calculate the TanStack Mutation Key for a Mutation Procedure
   *
   * @see https://trpc.io/docs/client/tanstack-react-query/usage#mutationKey
   */
  mutationKey: () => TRPCMutationKey;
}

export interface DecorateSubscriptionProcedure<TDef extends ResolverDef> {
  /**
   * Create a set of type-safe subscription options that can be passed to `useSubscription`
   *
   * @see https://trpc.io/docs/client/tanstack-react-query/usage#subscriptionOptions
   */
  subscriptionOptions: TRPCSubscriptionOptions<TDef>;
}

export type DecorateProcedure<
  TType extends TRPCProcedureType,
  TDef extends ResolverDef,
> = TType extends 'query'
  ? DecorateQueryProcedure<TDef>
  : TType extends 'mutation'
    ? DecorateMutationProcedure<TDef>
    : TType extends 'subscription'
      ? DecorateSubscriptionProcedure<TDef>
      : never;

/**
 * @internal
 */
export type DecoratedRouterRecord<
  TRoot extends AnyTRPCRootTypes,
  TRecord extends TRPCRouterRecord,
> = {
  [TKey in keyof TRecord]: TRecord[TKey] extends infer $Value
    ? $Value extends TRPCRouterRecord
      ? DecoratedRouterRecord<TRoot, $Value> & DecorateRouterKeyable
      : $Value extends AnyTRPCProcedure
        ? DecorateProcedure<
            $Value['_def']['type'],
            {
              input: inferProcedureInput<$Value>;
              output: inferTransformedProcedureOutput<TRoot, $Value>;
              transformer: TRoot['transformer'];
              errorShape: TRoot['errorShape'];
            }
          >
        : never
    : never;
};

export type TRPCOptionsProxy<TRouter extends AnyTRPCRouter> =
  DecoratedRouterRecord<
    TRouter['_def']['_config']['$types'],
    TRouter['_def']['record']
  > &
    DecorateRouterKeyable;

export interface TRPCOptionsProxyOptionsBase {
  queryClient: QueryClient | (() => QueryClient);
  overrides?: {
    mutations?: MutationOptionsOverride;
  };
}

export interface TRPCOptionsProxyOptionsInternal<
  TRouter extends AnyTRPCRouter,
> {
  router: TRouter;
  ctx:
    | inferRouterContext<TRouter>
    | (() => MaybePromise<inferRouterContext<TRouter>>);
}

export interface TRPCOptionsProxyOptionsExternal<
  TRouter extends AnyTRPCRouter,
> {
  client: TRPCUntypedClient<TRouter> | TRPCClient<TRouter>;
}

export type TRPCOptionsProxyOptions<TRouter extends AnyTRPCRouter> =
  TRPCOptionsProxyOptionsBase &
    (
      | TRPCOptionsProxyOptionsInternal<TRouter>
      | TRPCOptionsProxyOptionsExternal<TRouter>
    );

type UtilsMethods =
  | keyof DecorateQueryProcedure<any>
  | keyof DecorateMutationProcedure<any>
  | keyof DecorateSubscriptionProcedure<any>
  | keyof DecorateRouterKeyable;

/**
 * Create a typed proxy from your router types. Can also be used on the server.
 *
 * @see https://trpc.io/docs/client/tanstack-react-query/setup#3b-setup-without-react-context
 * @see https://trpc.io/docs/client/tanstack-react-query/server-components#5-create-a-trpc-caller-for-server-components
 */
export function createTRPCOptionsProxy<TRouter extends AnyTRPCRouter>(
  opts: TRPCOptionsProxyOptions<TRouter>,
): TRPCOptionsProxy<TRouter> {
  const callIt = (type: TRPCProcedureType): any => {
    return (path: string, input: unknown, trpcOpts: TRPCRequestOptions) => {
      if ('router' in opts) {
        return Promise.resolve(unwrapLazyArg(opts.ctx)).then((ctx) =>
          callTRPCProcedure({
            router: opts.router,
            path: path,
            getRawInput: async () => input,
            ctx: ctx,
            type: type,
            signal: undefined,
          }),
        );
      }

      const untypedClient =
        opts.client instanceof TRPCUntypedClient
          ? opts.client
          : getUntypedClient(opts.client);

      return untypedClient[type](path, input, trpcOpts);
    };
  };

  return createTRPCRecursiveProxy(({ args, path: _path }) => {
    const path = [..._path];
    const utilName = path.pop() as UtilsMethods;
    const [arg1, arg2] = args as any[];

    const contextMap: Record<UtilsMethods, () => unknown> = {
      '~types': undefined as any,

      routeKey: () => {
        return getQueryKeyInternal(path);
      },
      routeFilter: (): QueryFilters => {
        return {
          ...arg1,
          queryKey: getQueryKeyInternal(path),
        };
      },

      queryKey: () => {
        return getQueryKeyInternal(path, arg1, 'query');
      },
      queryFilter: (): QueryFilters => {
        return {
          ...arg2,
          queryKey: getQueryKeyInternal(path, arg1, 'query'),
        };
      },
      queryOptions: () => {
        return trpcQueryOptions({
          opts: arg2,
          path,
          queryClient: opts.queryClient,
          queryKey: getQueryKeyInternal(path, arg1, 'query'),
          query: callIt('query'),
        });
      },

      infiniteQueryKey: () => {
        return getQueryKeyInternal(path, arg1, 'infinite');
      },
      infiniteQueryOptions: () => {
        return trpcInfiniteQueryOptions({
          opts: arg2,
          path,
          queryClient: opts.queryClient,
          queryKey: getQueryKeyInternal(path, arg1, 'infinite'),
          query: callIt('query'),
        });
      },
      infiniteQueryFilter: (): QueryFilters => {
        return {
          ...arg2,
          queryKey: getQueryKeyInternal(path, arg1, 'infinite'),
        };
      },

      mutationKey: () => {
        return getMutationKeyInternal(path);
      },
      mutationOptions: () => {
        return trpcMutationOptions({
          opts: arg1,
          path,
          queryClient: opts.queryClient,
          mutate: callIt('mutation'),
          overrides: opts.overrides?.mutations,
        });
      },

      subscriptionOptions: () => {
        return trpcSubscriptionOptions({
          opts: arg2,
          path,
          queryKey: getQueryKeyInternal(path, arg1, 'any'),
          subscribe: callIt('subscription'),
        });
      },
    };

    return contextMap[utilName]();
  });
}
