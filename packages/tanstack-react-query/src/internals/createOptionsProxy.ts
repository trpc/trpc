import type { DataTag } from '@tanstack/react-query';
import { type QueryClient, type QueryFilters } from '@tanstack/react-query';
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
  MaybePromise,
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
import type {
  QueryType,
  ResolverDef,
  TRPCMutationKey,
  TRPCQueryFilters,
  TRPCQueryKey,
} from './types';
import {
  getMutationKeyInternal,
  getQueryKeyInternal,
  unwrapLazyArg,
} from './utils';

export interface DecorateQueryKeyable {
  /**
   * Calculate the Tanstack Query Key for a Route
   *
   * @see https://tanstack.com/query/latest/docs/framework/react/guides/query-keys
   */
  queryKey: () => TRPCQueryKey;

  /**
   * Calculate a Tanstack Query Filter for a Route
   *
   * @see https://tanstack.com/query/latest/docs/framework/react/guides/filters
   */
  queryFilter: (input?: undefined, filters?: TRPCQueryFilters) => QueryFilters;
}

export type InferInput<
  TProcedure extends
    | DecorateQueryProcedure<any>
    | DecorateMutationProcedure<any>,
> = TProcedure['~types']['input'];

export type InferOutput<
  TProcedure extends
    | DecorateQueryProcedure<any>
    | DecorateMutationProcedure<any>,
> = TProcedure['~types']['output'];

export interface DecorateQueryProcedure<TDef extends ResolverDef> {
  /**
   * @internal prefer using InferInput and InferOutput to access types
   */
  '~types': {
    input: TDef['input'];
    output: TDef['output'];
  };

  /**
   * @see https://tanstack.com/query/latest/docs/framework/react/reference/queryOptions#queryoptions
   */
  queryOptions: TRPCQueryOptions<TDef>;

  /**
   * @see https://tanstack.com/query/latest/docs/framework/react/reference/infiniteQueryOptions#infinitequeryoptions
   */
  infiniteQueryOptions: TRPCInfiniteQueryOptions<TDef>;

  /**
   * Calculate the Tanstack Query Key for a Query Procedure
   *
   * @see https://tanstack.com/query/latest/docs/framework/react/guides/query-keys
   */
  queryKey: (
    input?: TDef['input'],
  ) => TRPCQueryKey & DataTag<unknown, TDef['output']>;

  /**
   * Calculate a Tanstack Query Filter for a Query Procedure
   *
   * @see https://tanstack.com/query/latest/docs/framework/react/guides/filters
   */
  queryFilter: (
    input?: TDef['input'],
    filters?: TRPCQueryFilters<TDef['output'], TDef['errorShape']>,
  ) => TRPCQueryFilters<TDef['output'], TDef['errorShape']>;
}

export interface DecorateMutationProcedure<TDef extends ResolverDef> {
  /**
   * @internal prefer using InferInput and InferOutput to access types
   */
  '~types': {
    input: TDef['input'];
    output: TDef['output'];
  };

  /**
   * @see
   */
  mutationOptions: TRPCMutationOptions<TDef>;

  /**
   * Calculate the Tanstack Mutation Key for a Mutation Procedure
   */
  mutationKey: () => TRPCMutationKey;
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
    DecorateQueryKeyable;

export interface TRPCOptionsProxyOptionsBase {
  queryClient: QueryClient | (() => QueryClient);
  overrides?: {
    mutations?: MutationOptionsOverride;
  };
}

export interface TRPCOptionsProxyOptionsInternal<TRouter extends AnyRouter> {
  router: TRouter;
  ctx:
    | inferRouterContext<TRouter>
    | (() => MaybePromise<inferRouterContext<TRouter>>);
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
  const callIt = (type: ProcedureType): any => {
    return (path: string, input: unknown, trpcOpts: TRPCRequestOptions) => {
      if ('router' in opts) {
        return Promise.resolve(unwrapLazyArg(opts.ctx)).then((ctx) =>
          callProcedure({
            procedures: opts.router._def.procedures,
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

  return createRecursiveProxy(({ args, path: _path }) => {
    const path = [..._path];
    const utilName = path.pop() as UtilsMethods;
    const [arg1, arg2] = args as any[];

    function getQueryKey() {
      const queryType = getQueryType(utilName);

      return getQueryKeyInternal(path, arg1, queryType ?? 'any');
    }

    const contextMap: Record<UtilsMethods, () => unknown> = {
      '~types': undefined as any,

      mutationKey: () => {
        return getMutationKeyInternal(path);
      },
      queryKey: () => {
        return getQueryKey();
      },
      queryFilter: (): QueryFilters => {
        return {
          ...arg2,
          queryKey: getQueryKey(),
        };
      },
      infiniteQueryOptions: () => {
        return trpcInfiniteQueryOptions({
          opts: arg2,
          path,
          queryClient: opts.queryClient,
          queryKey: getQueryKey(),
          query: callIt('query'),
        });
      },
      queryOptions: () => {
        return trpcQueryOptions({
          opts: arg2,
          path,
          queryClient: opts.queryClient,
          queryKey: getQueryKey(),
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
          queryKey: getQueryKey(),
          subscribe: callIt('subscription'),
        });
      },
    };

    return contextMap[utilName]();
  });
}
