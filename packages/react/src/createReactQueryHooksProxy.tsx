/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
  AnyRouter,
  OmitNeverKeys,
  Procedure,
  ProcedureRouterRecord,
  inferProcedureClientError,
  inferProcedureInput,
  inferProcedureOutput,
} from '@trpc/server';
import { createProxy } from '@trpc/server/shared';
import {
  UseInfiniteQueryResult,
  UseMutationResult,
  UseQueryResult,
} from 'react-query';
import {
  CreateReactQueryHooks,
  UseTRPCInfiniteQueryOptions,
  UseTRPCMutationOptions,
  UseTRPCQueryOptions,
} from './createReactQueryHooks';
import { getQueryKey } from './internals/getQueryKey';
import {
  DecoratedProcedureUtilsRecord,
  createReactQueryUtilsProxy,
} from './internals/utilsProxy';

export type DecorateProcedure<
  TProcedure extends Procedure<any>,
  TPath extends string,
> = OmitNeverKeys<{
  useQuery: TProcedure extends { _query: true }
    ? <
        TQueryFnData = inferProcedureOutput<TProcedure>,
        TData = inferProcedureOutput<TProcedure>,
      >(
        ...args: [
          inferProcedureInput<TProcedure>,
          void | UseTRPCQueryOptions<
            TPath,
            inferProcedureInput<TProcedure>,
            TQueryFnData,
            TData,
            inferProcedureClientError<TProcedure>
          >,
        ]
      ) => UseQueryResult<TData, inferProcedureClientError<TProcedure>>
    : never;

  useMutation: TProcedure extends { _mutation: true }
    ? <TContext = unknown>(
        opts?: UseTRPCMutationOptions<
          inferProcedureInput<TProcedure>,
          inferProcedureClientError<TProcedure>,
          inferProcedureOutput<TProcedure>,
          TContext
        >,
      ) => UseMutationResult<
        inferProcedureOutput<TProcedure>,
        inferProcedureClientError<TProcedure>,
        inferProcedureInput<TProcedure>,
        TContext
      >
    : never;

  useInfiniteQuery: TProcedure extends { _query: true }
    ? inferProcedureInput<TProcedure> extends {
        cursor?: any;
      }
      ? <
          _TQueryFnData = inferProcedureOutput<TProcedure>,
          TData = inferProcedureOutput<TProcedure>,
        >(
          ...args: [
            Omit<inferProcedureInput<TProcedure>, 'cursor'>,
            void | UseTRPCInfiniteQueryOptions<
              TPath,
              inferProcedureInput<TProcedure>,
              TData,
              inferProcedureClientError<TProcedure>
            >,
          ]
        ) => UseInfiniteQueryResult<
          TData,
          inferProcedureClientError<TProcedure>
        >
      : never
    : never;
}>;

type assertProcedure<T> = T extends Procedure<any> ? T : never;

/**
 * @internal
 */
export type DecoratedProcedureRecord<
  TProcedures extends ProcedureRouterRecord,
  TPath extends string = '',
> = {
  [TKey in keyof TProcedures]: TProcedures[TKey] extends AnyRouter
    ? DecoratedProcedureRecord<
        TProcedures[TKey]['_def']['record'],
        `${TPath}${TKey & string}.`
      >
    : DecorateProcedure<
        assertProcedure<TProcedures[TKey]>,
        `${TPath}${TKey & string}`
      >;
};

export function createReactQueryHooksProxy<
  TRouter extends AnyRouter,
  TSSRContext = unknown,
>(trpc: CreateReactQueryHooks<TRouter, TSSRContext>) {
  const proxy = createProxy((opts) => {
    const args = opts.args;

    if (opts.path[0] === 'useContext') {
      const context = trpc.useContext();
      return createReactQueryUtilsProxy(context);
    }

    const pathCopy = [...opts.path];

    // The last arg is for instance `.useMutation` or `.useQuery()`
    const lastArg = pathCopy.pop()!;

    // The `path` ends up being something like `post.byId`
    const path = pathCopy.join('.');
    if (lastArg === 'useMutation') {
      return (trpc as any)[lastArg](path, ...args);
    }
    const [input, ...rest] = args;

    const queryKey = getQueryKey(path, input);
    return (trpc as any)[lastArg](queryKey, ...rest);
  });

  return proxy as {
    useContext(): DecoratedProcedureUtilsRecord<TRouter>;
  } & DecoratedProcedureRecord<TRouter['_def']['record']>;
}
