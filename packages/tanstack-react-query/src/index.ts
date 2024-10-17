import type { QueryClient } from '@tanstack/react-query';
import {
  getUntypedClient,
  TRPCUntypedClient,
  type CreateTRPCClient,
} from '@trpc/client';
import type { AnyQueryProcedure, AnyRouter, AnyTRPCRouter } from '@trpc/server';
import { createRecursiveProxy } from '@trpc/server/unstable-core-do-not-import';
import type {
  AnyRootTypes,
  RouterRecord,
} from '@trpc/server/unstable-core-do-not-import';
import {
  trpcInfiniteQueryOptions,
  type TRPCInfiniteQueryOptions,
} from './infiniteQueryOptions';
import { getQueryKeyInternal, type QueryType } from './queryKey';
import { trpcQueryOptions, type TRPCQueryOptions } from './queryOptions';

export interface DecorateQueryProcedure<
  TRoot extends AnyRootTypes,
  TProcedure extends AnyQueryProcedure,
> {
  queryOptions: TRPCQueryOptions<TRoot, TProcedure>;
  infiniteQueryOptions: TRPCInfiniteQueryOptions<TRoot, TProcedure>;
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
      : //   : $Value extends AnyMutationProcedure
        //   ? DecorateMutationProcedure<TRoot, $Value>
        //   : never
        never
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
}

type UtilsMethods = keyof DecorateQueryProcedure<any, any>;

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
    const [input, userQueryOptions] = opts.args as any[];

    const queryType: QueryType =
      utilName === 'infiniteQueryOptions' ? 'infinite' : 'query';
    const queryKey = getQueryKeyInternal(path, input, queryType);

    const contextMap: Record<UtilsMethods, () => unknown> = {
      infiniteQueryOptions: () =>
        trpcInfiniteQueryOptions({
          opts: userQueryOptions,
          path,
          queryClient: context.queryClient,
          queryKey,
          untypedClient,
        }),
      queryOptions: () => {
        return trpcQueryOptions({
          opts: userQueryOptions,
          path,
          queryClient: context.queryClient,
          queryKey,
          untypedClient,
        });
      },
    };

    return contextMap[utilName]();
  });
}
