import type { QueryOptions } from '@tanstack/react-query';
import type { TRPCClientError, TRPCUntypedClient } from '@trpc/client';
import type {
  AnyProcedure,
  AnyQueryProcedure,
  AnyRootTypes,
  AnyRouter,
  inferProcedureInput,
  inferTransformedProcedureOutput,
  RouterRecord,
} from '@trpc/server/unstable-core-do-not-import';
import { createRecursiveProxy } from '@trpc/server/unstable-core-do-not-import';
import { getQueryKeyInternal } from '../../internals/getQueryKey';
import type {
  TrpcQueryOptionsForUseQueries,
  TrpcQueryOptionsForUseSuspenseQueries,
} from '../../internals/useQueries';
import type { TRPCUseQueryBaseOptions } from '../hooks/types';

type GetQueryOptions<
  TRoot extends AnyRootTypes,
  TProcedure extends AnyProcedure,
> = <TData = inferTransformedProcedureOutput<TRoot, TProcedure>>(
  input: inferProcedureInput<TProcedure>,
  opts?: TrpcQueryOptionsForUseQueries<
    inferTransformedProcedureOutput<TRoot, TProcedure>,
    TData,
    TRPCClientError<TRoot>
  >,
) => TrpcQueryOptionsForUseQueries<
  inferTransformedProcedureOutput<TRoot, TProcedure>,
  TData,
  TRPCClientError<TRoot>
>;

/**
 * @internal
 */
export type UseQueriesProcedureRecord<
  TRoot extends AnyRootTypes,
  TRecord extends RouterRecord,
> = {
  [TKey in keyof TRecord]: TRecord[TKey] extends infer $Value
    ? $Value extends RouterRecord
      ? UseQueriesProcedureRecord<TRoot, $Value>
      : $Value extends AnyQueryProcedure
      ? GetQueryOptions<TRoot, $Value>
      : never
    : never;
};

type GetSuspenseQueryOptions<
  TRoot extends AnyRootTypes,
  TProcedure extends AnyQueryProcedure,
> = <TData = inferTransformedProcedureOutput<TRoot, TProcedure>>(
  input: inferProcedureInput<TProcedure>,
  opts?: TrpcQueryOptionsForUseSuspenseQueries<
    inferTransformedProcedureOutput<TRoot, TProcedure>,
    TData,
    TRPCClientError<TRoot>
  >,
) => TrpcQueryOptionsForUseSuspenseQueries<
  inferTransformedProcedureOutput<TRoot, TProcedure>,
  TData,
  TRPCClientError<TRoot>
>;

/**
 * @internal
 */
export type UseSuspenseQueriesProcedureRecord<
  TRoot extends AnyRootTypes,
  TRecord extends RouterRecord,
> = {
  [TKey in keyof TRecord]: TRecord[TKey] extends infer $Value
    ? $Value extends RouterRecord
      ? UseSuspenseQueriesProcedureRecord<TRoot, $Value>
      : $Value extends AnyQueryProcedure
      ? GetSuspenseQueryOptions<TRoot, $Value>
      : never
    : never;
};

/**
 * Create proxy for `useQueries` options
 * @internal
 */
export function createUseQueries<TRouter extends AnyRouter>(
  client: TRPCUntypedClient<TRouter>,
) {
  return createRecursiveProxy((opts) => {
    const arrayPath = opts.path;
    const dotPath = arrayPath.join('.');
    const [input, _opts] = opts.args as [
      unknown,
      Partial<QueryOptions> & TRPCUseQueryBaseOptions,
    ];

    const options: QueryOptions = {
      queryKey: getQueryKeyInternal(arrayPath, input, 'query'),
      queryFn: () => {
        return client.query(dotPath, input, _opts?.trpc);
      },
      ..._opts,
    };

    return options;
  }) as UseQueriesProcedureRecord<
    TRouter['_def']['_config']['$types'],
    TRouter['_def']['record']
  >;
}
