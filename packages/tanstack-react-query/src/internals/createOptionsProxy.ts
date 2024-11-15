import type { QueryFilters } from '@tanstack/react-query';
import { type QueryClient } from '@tanstack/react-query';
import {
  getUntypedClient,
  TRPCUntypedClient,
  type CreateTRPCClient,
  type TRPCRequestOptions,
} from '@trpc/client';
import {
  callProcedure,
  type AnyProcedure,
  type inferProcedureInput,
  type inferRouterContext,
  type inferTransformedProcedureOutput,
  type ProcedureType,
} from '@trpc/server';
import { createRecursiveProxy } from '@trpc/server/unstable-core-do-not-import';
import type {
  AnyRootTypes,
  AnyRouter,
  RouterRecord,
} from '@trpc/server/unstable-core-do-not-import';
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
import type { QueryType, ResolverDef, TRPCQueryKey } from './types';
import { getQueryKeyInternal } from './utils';

export interface DecorateQueryKeyable {
  /**
   * Useful for query invalidation
   *
   * @see https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation
   */
  getQueryKey: () => TRPCQueryKey;

  /**
   * Simple utility to invalidate a query or router
   *
   * @see https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation
   */
  invalidate: () => Promise<void>;

  /**
   * Used for invalidate, cancellation, refatching
   */
  getQueryFilter: () => QueryFilters;
}

export interface DecorateQueryClient {
  queryClient: QueryClient;
}

export interface DecorateQueryProcedure<TDef extends ResolverDef> {
  _input: TDef['input'];
  _output: TDef['output'];

  /**
   * @see https://tanstack.com/query/latest/docs/framework/react/reference/queryOptions#queryoptions
   */
  queryOptions: TRPCQueryOptions<TDef>;

  /**
   * @see https://tanstack.com/query/latest/docs/framework/react/reference/infiniteQueryOptions#infinitequeryoptions
   */
  infiniteQueryOptions: TRPCInfiniteQueryOptions<TDef>;

  /**
   * Useful for query invalidation
   *
   * @see https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation
   */
  getQueryKey: (input?: TDef['input']) => TRPCQueryKey;

  /**
   * Simple utility to invalidate a query or router
   *
   * @see https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation
   */
  invalidate: (input?: TDef['input']) => Promise<void>;

  /**
   * Used for invalidate, cancellation, refatching
   */
  getQueryFilter: (input?: TDef['input']) => QueryFilters;
}

export interface DecorateMutationProcedure<TDef extends ResolverDef> {
  _input: TDef['input'];
  _output: TDef['output'];

  /**
   * @see
   */
  mutationOptions: TRPCMutationOptions<TDef>;
}

export interface DecorateSubscriptionProcedure<TDef extends ResolverDef> {
  /**
   * @see
   */
  subscriptionOptions: TRPCSubscriptionOptions<TDef>;
}

export type DecorateProcedure<
  TType extends ProcedureType,
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
export type DecoratedProcedureUtilsRecord<
  TRoot extends AnyRootTypes,
  TRecord extends RouterRecord,
> = {
  [TKey in keyof TRecord]: TRecord[TKey] extends infer $Value
    ? $Value extends RouterRecord
      ? DecoratedProcedureUtilsRecord<TRoot, $Value> & DecorateQueryKeyable
      : $Value extends AnyProcedure
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

export type TRPCOptionsProxy<TRouter extends AnyRouter> =
  DecoratedProcedureUtilsRecord<
    TRouter['_def']['_config']['$types'],
    TRouter['_def']['record']
  > &
    DecorateQueryKeyable &
    DecorateQueryClient;

export type RouterLike<TRouter extends AnyRouter> =
  DecoratedProcedureUtilsRecord<
    TRouter['_def']['_config']['$types'],
    TRouter['_def']['record']
  > &
    DecorateQueryKeyable;

export interface TRPCOptionsProxyOptionsBase {
  queryClient: QueryClient;
  overrides?: {
    mutations?: MutationOptionsOverride;
  };
}

export interface TRPCOptionsProxyOptionsInternal<TRouter extends AnyRouter> {
  router: TRouter;
  ctx: inferRouterContext<TRouter>;
}

export interface TRPCOptionsProxyOptionsExternal<TRouter extends AnyRouter> {
  client: TRPCUntypedClient<TRouter> | CreateTRPCClient<TRouter>;
}

export type TRPCOptionsProxyOptions<TRouter extends AnyRouter> =
  TRPCOptionsProxyOptionsBase &
    (
      | TRPCOptionsProxyOptionsInternal<TRouter>
      | TRPCOptionsProxyOptionsExternal<TRouter>
    );

type UtilsMethods =
  | keyof DecorateQueryProcedure<any>
  | keyof DecorateMutationProcedure<any>
  | keyof DecorateSubscriptionProcedure<any>
  | keyof DecorateQueryClient;

function getQueryType(method: UtilsMethods) {
  const map: Partial<Record<UtilsMethods, QueryType>> = {
    queryOptions: 'query',
    infiniteQueryOptions: 'infinite',
    subscriptionOptions: 'any',
    mutationOptions: 'any',
  };

  return map[method];
}

export function createTRPCOptionsProxy<TRouter extends AnyRouter>(
  opts: TRPCOptionsProxyOptions<TRouter>,
): TRPCOptionsProxy<TRouter> {
  const callIt = (type: ProcedureType) => {
    return (
      path: string,
      input: unknown,
      trpcOpts: TRPCRequestOptions,
    ): any => {
      if ('router' in opts) {
        return callProcedure({
          procedures: opts.router._def.procedures,
          path: path,
          getRawInput: async () => input,
          ctx: opts.ctx,
          type: type,
          signal: undefined,
        });
      }

      const untypedClient =
        opts.client instanceof TRPCUntypedClient
          ? opts.client
          : getUntypedClient(opts.client);

      return untypedClient[type](path, input, trpcOpts);
    };
  };

  return createRecursiveProxy(({ args, path: _path }) => {
    const path = [..._path];
    const utilName = path.pop() as UtilsMethods;
    const [arg1, arg2] = args as any[];

    const queryType = getQueryType(utilName);
    const queryKey = getQueryKeyInternal(path, arg1, queryType ?? 'any');

    const contextMap: Record<UtilsMethods, () => unknown> = {
      _input: null as any,
      _output: null as any,
      getQueryKey: () => queryKey,
      queryClient: opts.queryClient as any,
      getQueryFilter: (): QueryFilters => {
        return {
          queryKey: queryKey,
        };
      },
      invalidate: async () => {
        await opts.queryClient.invalidateQueries({
          queryKey: queryKey,
        });
      },
      infiniteQueryOptions: () =>
        trpcInfiniteQueryOptions({
          opts: arg2,
          path,
          queryClient: opts.queryClient,
          queryKey: queryKey,
          query: callIt('query'),
        }),
      queryOptions: () => {
        return trpcQueryOptions({
          opts: arg2,
          path,
          queryClient: opts.queryClient,
          queryKey: queryKey,
          query: callIt('query'),
        });
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
          queryKey: queryKey,
          subscribe: callIt('subscription'),
        });
      },
    };

    return contextMap[utilName]();
  });
}
