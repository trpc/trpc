import type { DataTag, QueryClient, QueryFilters } from '@tanstack/react-query';
import type {
  TRPCClient,
  TRPCClientErrorLike,
  TRPCRequestOptions,
} from '@trpc/client';
import { getUntypedClient, TRPCUntypedClient } from '@trpc/client';
import type {
  AnyTRPCProcedure,
  AnyTRPCRootTypes,
  AnyTRPCRouter,
  inferProcedureErrorShape,
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
import type {
  DefaultFeatureFlags,
  FeatureFlags,
  inferFeatureFlags,
  KeyPrefixOptions,
  OptionalCursorInput,
  ResolverDef,
  TRPCInfiniteData,
  TRPCMutationKey,
  TRPCQueryKey,
  WithRequired,
} from './types';
import {
  getMutationKeyInternal,
  getQueryKeyInternal,
  unwrapLazyArg,
} from './utils';

export interface DecorateRouterKeyable<TFeatureFlags extends FeatureFlags> {
  /**
   * Calculate the TanStack Query Key for any path, could be used to invalidate every procedure beneath this path
   *
   * @see https://tanstack.com/query/latest/docs/framework/react/guides/query-keys
   * @see https://trpc.io/docs/client/tanstack-react-query/usage#queryKey
   */
  pathKey: () => TRPCQueryKey<TFeatureFlags['keyPrefix']>;

  /**
   * Calculate a TanStack Query Filter for any path, could be used to manipulate every procedure beneath this path
   *
   * @see https://tanstack.com/query/latest/docs/framework/react/guides/filters
   * @see https://trpc.io/docs/client/tanstack-react-query/usage#queryFilter
   */
  pathFilter: (
    filters?: QueryFilters<TRPCQueryKey<TFeatureFlags['keyPrefix']>>,
  ) => WithRequired<
    QueryFilters<TRPCQueryKey<TFeatureFlags['keyPrefix']>>,
    'queryKey'
  >;
}

interface TypeHelper<TDef extends ResolverDef> {
  /**
   * @internal prefer using inferInput and inferOutput to access types
   */
  '~types': {
    input: TDef['input'];
    output: TDef['output'];
    errorShape: TDef['errorShape'];
  };
}

export type inferInput<
  TProcedure extends
    | DecorateInfiniteQueryProcedure<any>
    | DecorateQueryProcedure<any>
    | DecorateMutationProcedure<any>,
> = TProcedure['~types']['input'];

export type inferOutput<
  TProcedure extends
    | DecorateInfiniteQueryProcedure<any>
    | DecorateQueryProcedure<any>
    | DecorateMutationProcedure<any>,
> = TProcedure['~types']['output'];

export interface DecorateInfiniteQueryProcedure<
  TDef extends ResolverDef,
> extends TypeHelper<TDef> {
  /**
   * Create a set of type-safe infinite query options that can be passed to `useInfiniteQuery`, `prefetchInfiniteQuery` etc.
   *
   * @see https://tanstack.com/query/latest/docs/framework/react/reference/infiniteQueryOptions#infinitequeryoptions
   * @see https://trpc.io/docs/client/tanstack-react-query/usage#infiniteQueryOptions
   */
  infiniteQueryOptions: TRPCInfiniteQueryOptions<TDef>;

  /**
   * Calculate the TanStack Query Key for a Infinite Query Procedure
   *
   * @see https://tanstack.com/query/latest/docs/framework/react/guides/query-keys
   * @see https://trpc.io/docs/client/tanstack-react-query/usage#queryKey
   */
  infiniteQueryKey: (input?: Partial<TDef['input']>) => DataTag<
    TRPCQueryKey<inferFeatureFlags<TDef>['keyPrefix']>,
    TRPCInfiniteData<TDef['input'], TDef['output']>,
    TRPCClientErrorLike<{
      transformer: TDef['transformer'];
      errorShape: TDef['errorShape'];
    }>
  >;

  /**
   * Calculate a TanStack Query Filter for a Infinite Query Procedure
   *
   * @see https://tanstack.com/query/latest/docs/framework/react/guides/filters
   * @see https://trpc.io/docs/client/tanstack-react-query/usage#queryFilter
   */
  infiniteQueryFilter: (
    input?: Partial<TDef['input']>,
    filters?: QueryFilters<
      DataTag<
        TRPCQueryKey<inferFeatureFlags<TDef>['keyPrefix']>,
        TRPCInfiniteData<TDef['input'], TDef['output']>,
        TRPCClientErrorLike<{
          transformer: TDef['transformer'];
          errorShape: TDef['errorShape'];
        }>
      >
    >,
  ) => WithRequired<
    QueryFilters<
      DataTag<
        TRPCQueryKey<inferFeatureFlags<TDef>['keyPrefix']>,
        TRPCInfiniteData<TDef['input'], TDef['output']>,
        TRPCClientErrorLike<{
          transformer: TDef['transformer'];
          errorShape: TDef['errorShape'];
        }>
      >
    >,
    'queryKey'
  >;
}
export interface DecorateQueryProcedure<TDef extends ResolverDef>
  extends TypeHelper<TDef>, DecorateRouterKeyable<inferFeatureFlags<TDef>> {
  /**
   * Create a set of type-safe query options that can be passed to `useQuery`, `prefetchQuery` etc.
   *
   * @see https://tanstack.com/query/latest/docs/framework/react/reference/queryOptions#queryoptions
   * @see https://trpc.io/docs/client/tanstack-react-query/usage#queryOptions
   */
  queryOptions: TRPCQueryOptions<TDef>;

  /**
   * Calculate the TanStack Query Key for a Query Procedure
   *
   * @see https://tanstack.com/query/latest/docs/framework/react/guides/query-keys
   * @see https://trpc.io/docs/client/tanstack-react-query/usage#queryKey
   */
  queryKey: (input?: Partial<TDef['input']>) => DataTag<
    TRPCQueryKey<inferFeatureFlags<TDef>['keyPrefix']>,
    TDef['output'],
    TRPCClientErrorLike<{
      transformer: TDef['transformer'];
      errorShape: TDef['errorShape'];
    }>
  >;

  /**
   * Calculate a TanStack Query Filter for a Query Procedure
   *
   * @see https://tanstack.com/query/latest/docs/framework/react/guides/filters
   * @see https://trpc.io/docs/client/tanstack-react-query/usage#queryFilter
   */
  queryFilter: (
    input?: Partial<TDef['input']>,
    filters?: QueryFilters<
      DataTag<
        TRPCQueryKey<inferFeatureFlags<TDef>['keyPrefix']>,
        TDef['output'],
        TRPCClientErrorLike<{
          transformer: TDef['transformer'];
          errorShape: TDef['errorShape'];
        }>
      >
    >,
  ) => WithRequired<
    QueryFilters<
      DataTag<
        TRPCQueryKey<inferFeatureFlags<TDef>['keyPrefix']>,
        TDef['output'],
        TRPCClientErrorLike<{
          transformer: TDef['transformer'];
          errorShape: TDef['errorShape'];
        }>
      >
    >,
    'queryKey'
  >;
}

export interface DecorateMutationProcedure<
  TDef extends ResolverDef,
> extends TypeHelper<TDef> {
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
  mutationKey: () => TRPCMutationKey<inferFeatureFlags<TDef>['keyPrefix']>;
}

export interface DecorateSubscriptionProcedure<
  TDef extends ResolverDef,
> extends TypeHelper<TDef> {
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
  ? DecorateQueryProcedure<TDef> &
      (TDef['input'] extends OptionalCursorInput
        ? DecorateInfiniteQueryProcedure<TDef>
        : Record<string, never>)
  : TType extends 'mutation'
    ? DecorateMutationProcedure<TDef>
    : TType extends 'subscription'
      ? DecorateSubscriptionProcedure<TDef>
      : never;

type DecoratedProcedureDef<
  TRoot extends AnyTRPCRootTypes,
  TProcedure extends AnyTRPCProcedure,
  TFeatureFlags extends FeatureFlags,
> = TFeatureFlags extends DefaultFeatureFlags
  ? {
      input: inferProcedureInput<TProcedure>;
      output: inferTransformedProcedureOutput<TRoot, TProcedure>;
      transformer: TRoot['transformer'];
      errorShape: inferProcedureErrorShape<TRoot, TProcedure>;
    }
  : {
      input: inferProcedureInput<TProcedure>;
      output: inferTransformedProcedureOutput<TRoot, TProcedure>;
      transformer: TRoot['transformer'];
      errorShape: inferProcedureErrorShape<TRoot, TProcedure>;
      featureFlags: TFeatureFlags;
    };

/**
 * @internal
 */
export type DecoratedRouterRecord<
  TRoot extends AnyTRPCRootTypes,
  TRecord extends TRPCRouterRecord,
  TFeatureFlags extends FeatureFlags = DefaultFeatureFlags,
> = {
  [TKey in keyof TRecord]: TRecord[TKey] extends infer $Value
    ? $Value extends TRPCRouterRecord
      ? DecoratedRouterRecord<TRoot, $Value, TFeatureFlags> &
          DecorateRouterKeyable<TFeatureFlags>
      : $Value extends AnyTRPCProcedure
        ? DecorateProcedure<
            $Value['_def']['type'],
            DecoratedProcedureDef<TRoot, $Value, TFeatureFlags>
          >
        : never
    : never;
};

export type TRPCOptionsProxy<
  TRouter extends AnyTRPCRouter,
  TFeatureFlags extends FeatureFlags = DefaultFeatureFlags,
> = DecoratedRouterRecord<
  TRouter['_def']['_config']['$types'],
  TRouter['_def']['record'],
  TFeatureFlags
> &
  DecorateRouterKeyable<TFeatureFlags>;

export type TRPCOptionsProxyOptionsBase<
  TFeatureFlags extends FeatureFlags = DefaultFeatureFlags,
> = {
  queryClient: QueryClient | (() => QueryClient);
  overrides?: {
    mutations?: MutationOptionsOverride;
  };
} & KeyPrefixOptions<TFeatureFlags>;

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

export type TRPCOptionsProxyOptions<
  TRouter extends AnyTRPCRouter,
  TFeatureFlags extends FeatureFlags = DefaultFeatureFlags,
> = TRPCOptionsProxyOptionsBase<TFeatureFlags> &
  (
    | TRPCOptionsProxyOptionsInternal<TRouter>
    | TRPCOptionsProxyOptionsExternal<TRouter>
  );

type UtilsMethods =
  | keyof DecorateQueryProcedure<any>
  | keyof DecorateInfiniteQueryProcedure<any>
  | keyof DecorateMutationProcedure<any>
  | keyof DecorateSubscriptionProcedure<any>;

/**
 * The feature flags for a `keyPrefix` of type `TKeyPrefix`: prefixed keys
 * for a string, unprefixed ones without a prefix, and either shape for
 * `string | undefined`. Feature flags are kept as they are.
 * @internal
 */
export type inferKeyPrefixFlags<TKeyPrefix> = [TKeyPrefix] extends [
  FeatureFlags,
]
  ? TKeyPrefix
  : [TKeyPrefix] extends [undefined]
    ? DefaultFeatureFlags
    : undefined extends TKeyPrefix
      ? { keyPrefix: boolean }
      : { keyPrefix: true };

/**
 * `keyPrefix`, typed so that `createTRPCOptionsProxy()` infers it.
 * @internal
 */
export type KeyPrefixInput<TKeyPrefix> = [TKeyPrefix] extends [FeatureFlags]
  ? KeyPrefixOptions<TKeyPrefix>
  : [TKeyPrefix] extends [undefined]
    ? {
        /**
         * To prefix keys, leave out the router type argument: the router type
         * comes from `client` (or `router`), and the key types from `keyPrefix`.
         */
        keyPrefix?: undefined;
      }
    : // Required, so that inferring from `string | undefined` keeps `undefined`
      { keyPrefix: TKeyPrefix };

/**
 * Create a typed proxy from your router types. Can also be used on the server.
 *
 * The router type comes from `client` (or `router`), and query and mutation
 * keys are typed with a prefix when you pass a `keyPrefix`, so no type
 * arguments are needed. `createTRPCOptionsProxy<AppRouter>()` still works
 * without a `keyPrefix`; passing feature flags as the second type argument
 * (`{ keyPrefix: true }`) is deprecated.
 *
 * @see https://trpc.io/docs/client/tanstack-react-query/setup#3c-set-up-without-react-context
 * @see https://trpc.io/docs/client/tanstack-react-query/server-components#5-create-a-trpc-caller-for-server-components
 */
export function createTRPCOptionsProxy<
  TRouter extends AnyTRPCRouter,
  TKeyPrefix extends string | undefined | FeatureFlags = undefined,
>(
  opts: TRPCOptionsProxyOptions<TRouter, { keyPrefix: boolean }> &
    KeyPrefixInput<TKeyPrefix>,
): TRPCOptionsProxy<TRouter, inferKeyPrefixFlags<TKeyPrefix>> {
  const prefix = opts.keyPrefix;

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
            batchIndex: 0,
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

      pathKey: () => {
        return getQueryKeyInternal({
          path,
          type: 'any',
          prefix,
        });
      },
      pathFilter: (): QueryFilters => {
        return {
          ...arg1,
          queryKey: getQueryKeyInternal({
            path,
            type: 'any',
            prefix,
          }),
        };
      },

      queryOptions: () => {
        return trpcQueryOptions({
          input: arg1,
          opts: arg2,
          path,
          queryClient: opts.queryClient,
          queryKey: getQueryKeyInternal({
            path,
            input: arg1,
            type: 'query',
            prefix,
          }),
          query: callIt('query'),
        });
      },
      queryKey: () => {
        return getQueryKeyInternal({
          path,
          input: arg1,
          type: 'query',
          prefix,
        });
      },
      queryFilter: (): QueryFilters => {
        return {
          ...arg2,
          queryKey: getQueryKeyInternal({
            path,
            input: arg1,
            type: 'query',
            prefix,
          }),
        };
      },

      infiniteQueryOptions: () => {
        return trpcInfiniteQueryOptions({
          input: arg1,
          opts: arg2,
          path,
          queryClient: opts.queryClient,
          queryKey: getQueryKeyInternal({
            path,
            input: arg1,
            type: 'infinite',
            prefix,
          }),
          query: callIt('query'),
        });
      },
      infiniteQueryKey: () => {
        return getQueryKeyInternal({
          path,
          input: arg1,
          type: 'infinite',
          prefix,
        });
      },
      infiniteQueryFilter: (): QueryFilters => {
        return {
          ...arg2,
          queryKey: getQueryKeyInternal({
            path,
            input: arg1,
            type: 'infinite',
            prefix,
          }),
        };
      },

      mutationOptions: () => {
        return trpcMutationOptions({
          opts: arg1,
          path,
          prefix,
          queryClient: opts.queryClient,
          mutate: callIt('mutation'),
          overrides: opts.overrides?.mutations,
        });
      },
      mutationKey: () => {
        return getMutationKeyInternal({
          path,
          prefix,
        });
      },

      subscriptionOptions: () => {
        return trpcSubscriptionOptions({
          opts: arg2,
          path,
          input: arg1,
          queryKey: getQueryKeyInternal({
            path,
            input: arg1,
            type: 'any',
            prefix,
          }),
          subscribe: callIt('subscription'),
        });
      },
    };

    return contextMap[utilName]();
  });
}
