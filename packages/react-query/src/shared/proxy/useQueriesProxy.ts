import { QueryOptions } from '@tanstack/react-query';
import { TRPCClient, TRPCClientError } from '@trpc/client';
import {
  AnyProcedure,
  AnyQueryProcedure,
  AnyRouter,
  Filter,
  ProcedureRouterRecord,
  inferProcedureInput,
} from '@trpc/server';
import {
  createRecursiveProxy,
  inferTransformedProcedureOutput,
} from '@trpc/server/shared';
import { getQueryKeyInternal } from '../../internals/getQueryKey';
import { TrpcQueryOptionsForUseQueries } from '../../internals/useQueries';

type GetQueryOptions<TProcedure extends AnyProcedure, TPath extends string> = <
  TData = inferTransformedProcedureOutput<TProcedure>,
>(
  input: inferProcedureInput<TProcedure>,
  opts?: TrpcQueryOptionsForUseQueries<
    TPath,
    inferProcedureInput<TProcedure>,
    inferTransformedProcedureOutput<TProcedure>,
    TData,
    TRPCClientError<TProcedure>
  >,
) => TrpcQueryOptionsForUseQueries<
  TPath,
  inferProcedureInput<TProcedure>,
  inferTransformedProcedureOutput<TProcedure>,
  TData,
  TRPCClientError<TProcedure>
>;

/**
 * @internal
 */
export type UseQueriesProcedureRecord<
  TRouter extends AnyRouter | ProcedureRouterRecord,
  TPath extends string = '',
> = TRouter extends AnyRouter
  ? UseRouterProcedureRecord<TRouter, TPath>
  : TRouter extends ProcedureRouterRecord
  ? UseProcedureRouterRecord<TRouter, TPath>
  : never;

type UseProcedureRouterRecord<
  TRouter extends ProcedureRouterRecord,
  TPath extends string = '',
> = {
  [TKey in keyof Filter<
    TRouter,
    AnyRouter | ProcedureRouterRecord | AnyQueryProcedure
  >]: TRouter[TKey] extends AnyRouter
    ? UseRouterProcedureRecord<TRouter[TKey], `${TPath}${TKey & string}.`>
    : TRouter[TKey] extends ProcedureRouterRecord
    ? UseProcedureRouterRecord<TRouter[TKey], `${TPath}${TKey & string}.`>
    : TRouter[TKey] extends AnyQueryProcedure
    ? GetQueryOptions<TRouter[TKey], `${TPath}${TKey & string}`>
    : never;
};

type UseRouterProcedureRecord<
  TRouter extends AnyRouter,
  TPath extends string = '',
> = {
  [TKey in keyof Filter<
    TRouter['_def']['record'],
    AnyRouter | ProcedureRouterRecord | AnyQueryProcedure
  >]: TRouter['_def']['record'][TKey] extends AnyRouter
    ? UseQueriesProcedureRecord<
        TRouter['_def']['record'][TKey],
        `${TPath}${TKey & string}.`
      >
    : TRouter['_def']['record'][TKey] extends ProcedureRouterRecord
    ? UseQueriesProcedureRecord<
        TRouter['_def']['record'][TKey],
        `${TPath}${TKey & string}.`
      >
    : GetQueryOptions<
        TRouter['_def']['record'][TKey],
        `${TPath}${TKey & string}`
      >;
};

// export type UseQueriesProcedureRecord<
//   TRouter extends AnyRouter,
//   TPath extends string = '',
// > = {
//   [TKey in keyof Filter<
//     TRouter['_def']['record'],
//     AnyRouter | ProcedureRouterRecord | AnyQueryProcedure
//   >]: TRouter['_def']['record'][TKey] extends AnyRouter | ProcedureRouterRecord
//     ? UseQueriesProcedureRecord<
//         TRouter['_def']['record'][TKey],
//         `${TPath}${TKey & string}.`
//       >
//     : GetQueryOptions<
//         TRouter['_def']['record'][TKey],
//         `${TPath}${TKey & string}`
//       >;
// };

/**
 * Create proxy for `useQueries` options
 * @internal
 */
export function createUseQueriesProxy<TRouter extends AnyRouter>(
  client: TRPCClient<TRouter>,
) {
  return createRecursiveProxy((opts) => {
    const path = opts.path.join('.');
    const [input, ...rest] = opts.args;

    const queryKey = getQueryKeyInternal(path, input);

    const options: QueryOptions = {
      queryKey,
      queryFn: () => {
        return client.query(path, input);
      },
      ...(rest[0] as any),
    };

    return options;
  }) as UseQueriesProcedureRecord<TRouter>;
}
