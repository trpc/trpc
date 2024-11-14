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
      ? DecoratedProcedureUtilsRecord<TRoot, $Value> & {
          /**
           * Useful for query invalidation
           *
           * @see https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation
           */
          getQueryKey: () => TRPCQueryKey;
        }
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
  > & {
    /**
     * Useful for query invalidation
     *
     * @see https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation
     */
    getQueryKey: () => TRPCQueryKey;
  };

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
  | keyof DecorateSubscriptionProcedure<any>;

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
    const [input, userOptions] = args as any[];

    const queryType = getQueryType(utilName);
    const queryKey = getQueryKeyInternal(path, input, queryType ?? 'any');

    const contextMap: Record<UtilsMethods, () => unknown> = {
      _input: null as any,
      _output: null as any,
      getQueryKey: () => queryKey,
      infiniteQueryOptions: () =>
        trpcInfiniteQueryOptions({
          opts: userOptions,
          path,
          queryClient: opts.queryClient,
          queryKey: queryKey as any as TRPCQueryKey,
          query: callIt('query'),
        }),
      queryOptions: () => {
        return trpcQueryOptions({
          opts: userOptions,
          path,
          queryClient: opts.queryClient,
          queryKey: queryKey as any as TRPCQueryKey,
          query: callIt('query'),
        });
      },
      mutationOptions: () => {
        return trpcMutationOptions({
          opts: userOptions,
          path,
          queryClient: opts.queryClient,
          mutate: callIt('mutation'),
          overrides: opts.overrides?.mutations,
        });
      },
      subscriptionOptions: () => {
        return trpcSubscriptionOptions({
          opts: userOptions,
          path,
          queryKey: queryKey as any as TRPCQueryKey,
          subscribe: callIt('subscription'),
        });
      },
    };

    return contextMap[utilName]();
  });
}
