import { type QueryClient } from '@tanstack/react-query';
import {
  getUntypedClient,
  TRPCUntypedClient,
  type CreateTRPCClient,
} from '@trpc/client';
import { createRecursiveProxy } from '@trpc/server/unstable-core-do-not-import';
import type {
  AnyMutationProcedure,
  AnyQueryProcedure,
  AnyRootTypes,
  AnyRouter,
  AnySubscriptionProcedure,
  RouterRecord,
} from '@trpc/server/unstable-core-do-not-import';
import {
  trpcInfiniteQueryOptions,
  type TRPCInfiniteQueryOptions,
} from './internals/infiniteQueryOptions';
import type { MutationOptionsOverride } from './internals/mutationOptions';
import {
  trpcMutationOptions,
  type TRPCMutationOptions,
} from './internals/mutationOptions';
import {
  trpcQueryOptions,
  type TRPCQueryOptions,
} from './internals/queryOptions';
import {
  trpcSubscriptionOptions,
  type TRPCSubscriptionOptions,
} from './internals/subscriptionOptions';
import type { QueryType } from './internals/types';
import { getQueryKeyInternal } from './internals/utils';

export interface DecorateQueryProcedure<
  TRoot extends AnyRootTypes,
  TProcedure extends AnyQueryProcedure,
> {
  /**
   * @see https://tanstack.com/query/latest/docs/framework/react/reference/queryOptions#queryoptions
   */
  queryOptions: TRPCQueryOptions<TRoot, TProcedure>;

  /**
   * @see https://tanstack.com/query/latest/docs/framework/react/reference/infiniteQueryOptions#infinitequeryoptions
   */
  infiniteQueryOptions: TRPCInfiniteQueryOptions<TRoot, TProcedure>;
}

export interface DecorateMutationProcedure<
  TRoot extends AnyRootTypes,
  TProcedure extends AnyMutationProcedure,
> {
  /**
   * @see
   */
  mutationOptions: TRPCMutationOptions<TRoot, TProcedure>;
}

export interface DecorateSubscriptionProcedure<
  TRoot extends AnyRootTypes,
  TProcedure extends AnySubscriptionProcedure,
> {
  /**
   * @see
   */
  subscriptionOptions: TRPCSubscriptionOptions<TRoot, TProcedure>;
}

/**
 * @internal
 */
export type DecoratedProcedureUtilsRecord<
  TRoot extends AnyRootTypes,
  TRecord extends RouterRecord,
> = {
  [TKey in keyof TRecord]: TRecord[TKey] extends infer $Value
    ? $Value extends RouterRecord
      ? DecoratedProcedureUtilsRecord<TRoot, $Value>
      : $Value extends AnyQueryProcedure
      ? DecorateQueryProcedure<TRoot, $Value>
      : $Value extends AnyMutationProcedure
      ? DecorateMutationProcedure<TRoot, $Value>
      : $Value extends AnySubscriptionProcedure
      ? DecorateSubscriptionProcedure<TRoot, $Value>
      : never
    : never;
};

export type CreateQueryUtils<TRouter extends AnyRouter> =
  DecoratedProcedureUtilsRecord<
    TRouter['_def']['_config']['$types'],
    TRouter['_def']['record']
  >;

export interface CreateQueryUtilsOptions<TRouter extends AnyRouter> {
  /**
   * The `TRPCClient`
   */
  client: CreateTRPCClient<TRouter> | TRPCUntypedClient<TRouter>;
  /**
   * The `QueryClient` from `react-query`
   */
  queryClient: QueryClient;
  /**
   * Overrides
   */
  overrides?: {
    mutations?: MutationOptionsOverride;
  };
}

type UtilsMethods =
  | keyof DecorateQueryProcedure<any, any>
  | keyof DecorateMutationProcedure<any, any>
  | keyof DecorateSubscriptionProcedure<any, any>;

function getQueryType(method: UtilsMethods) {
  return {
    queryOptions: 'query',
    infiniteQueryOptions: 'infinite',
    subscriptionOptions: 'any',
    mutationOptions: 'any',
  }[method] as QueryType;
}

export function createTRPCQueryUtils<TRouter extends AnyRouter>(
  context: CreateQueryUtilsOptions<TRouter>,
): CreateQueryUtils<TRouter> {
  const untypedClient =
    context.client instanceof TRPCUntypedClient
      ? context.client
      : getUntypedClient(context.client);

  return createRecursiveProxy((opts) => {
    const path = [...opts.path];
    const utilName = path.pop() as UtilsMethods;
    const [input, userOptions] = opts.args as any[];

    const queryType = getQueryType(utilName);
    const queryKey = getQueryKeyInternal(path, input, queryType);

    const contextMap: Record<UtilsMethods, () => unknown> = {
      infiniteQueryOptions: () =>
        trpcInfiniteQueryOptions({
          opts: userOptions,
          path,
          queryClient: context.queryClient,
          queryKey,
          untypedClient,
        }),
      queryOptions: () => {
        return trpcQueryOptions({
          opts: userOptions,
          path,
          queryClient: context.queryClient,
          queryKey: queryKey,
          untypedClient,
        });
      },
      mutationOptions: () => {
        return trpcMutationOptions({
          opts: userOptions,
          path,
          queryClient: context.queryClient,
          untypedClient,
          overrides: context.overrides?.mutations,
        });
      },
      subscriptionOptions: () => {
        return trpcSubscriptionOptions({
          opts: userOptions,
          path,
          queryKey,
          untypedClient,
        });
      },
    };

    return contextMap[utilName]();
  });
}

export { useSubscription } from './internals/subscriptionOptions';
