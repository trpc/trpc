import type { QueryClient } from '@tanstack/react-query';
import {
  getUntypedClient,
  TRPCUntypedClient,
  type CreateTRPCClient,
} from '@trpc/client';
import type {
  AnyMutationProcedure,
  AnyQueryProcedure,
  AnyRouter,
  AnyTRPCRouter,
} from '@trpc/server';
import { createRecursiveProxy } from '@trpc/server/unstable-core-do-not-import';
import type {
  AnyRootTypes,
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
      : never
    : never;
};

export type CreateQueryUtils<TRouter extends AnyRouter> =
  DecoratedProcedureUtilsRecord<
    TRouter['_def']['_config']['$types'],
    TRouter['_def']['record']
  >;

export interface CreateQueryUtilsOptions<TRouter extends AnyTRPCRouter> {
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
  | keyof DecorateMutationProcedure<any, any>;

export function createTRPCQueryUtils<TRouter extends AnyRouter>(
  context: CreateQueryUtilsOptions<TRouter>,
) {
  const untypedClient =
    context.client instanceof TRPCUntypedClient
      ? context.client
      : getUntypedClient(context.client);
  return createRecursiveProxy<CreateQueryUtils<TRouter>>((opts) => {
    const path = [...opts.path];
    const utilName = path.pop() as UtilsMethods;
    const [input, userOptions] = opts.args as any[];

    const queryType: QueryType =
      utilName === 'infiniteQueryOptions' ? 'infinite' : 'query';
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
    };

    return contextMap[utilName]();
  });
}
