import { QueryOptions } from '@tanstack/react-query';
import { TRPCClientError, TRPCUntypedClient } from '@trpc/client';
import {
  AnyProcedure,
  AnyQueryProcedure,
  AnyRouter,
  Filter,
  inferProcedureInput,
} from '@trpc/server';
import {
  createRecursiveProxy,
  inferTransformedProcedureOutput,
} from '@trpc/server/shared';
import { getQueryKey } from '../../internals/getQueryKey';
import { TrpcQueryOptionsForUseQueries } from '../../internals/useQueries';

type GetQueryOptions<
  TRouter extends AnyRouter,
  TProcedure extends AnyProcedure,
  TPath extends string,
> = <TData = inferTransformedProcedureOutput<TProcedure>>(
  input: inferProcedureInput<TProcedure>,
  opts?: TrpcQueryOptionsForUseQueries<
    TPath,
    inferProcedureInput<TProcedure>,
    inferTransformedProcedureOutput<TProcedure>,
    TData,
    TRPCClientError<TRouter>
  >,
) => TrpcQueryOptionsForUseQueries<
  TPath,
  inferProcedureInput<TProcedure>,
  inferTransformedProcedureOutput<TProcedure>,
  TData,
  TRPCClientError<TRouter>
>;

/**
 * @internal
 */
export type UseQueriesProcedureRecord<
  TRouter extends AnyRouter,
  TPath extends string = '',
> = {
  [TKey in keyof Filter<
    TRouter['_def']['record'],
    AnyRouter | AnyQueryProcedure
  >]: TRouter['_def']['record'][TKey] extends AnyRouter
    ? UseQueriesProcedureRecord<
        TRouter['_def']['record'][TKey],
        `${TPath}${TKey & string}.`
      >
    : GetQueryOptions<
        TRouter,
        TRouter['_def']['record'][TKey],
        `${TPath}${TKey & string}`
      >;
};

/**
 * Create proxy for `useQueries` options
 * @internal
 */
export function createUseQueriesProxy<TRouter extends AnyRouter>(
  client: TRPCUntypedClient<TRouter>,
) {
  return createRecursiveProxy((opts) => {
    const arrayPath = opts.path;
    const dotPath = arrayPath.join('.');
    const [input, ...rest] = opts.args;

    const options: QueryOptions = {
      queryKey: getQueryKey(arrayPath, input, 'query'),
      queryFn: () => {
        return client.query(dotPath, input);
      },
      ...(rest[1] as any),
    };

    return options;
  }) as UseQueriesProcedureRecord<TRouter>;
}
