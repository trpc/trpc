import {
  AnyRouter,
  Procedure,
  ProcedureRouterRecord,
  inferProcedureInput,
  inferProcedureOutput,
  inferProcedureParams,
} from '@trpc/server';
import { createProxy } from '@trpc/server/shared';
// import { RecursiveRecord } from 'packages/server/src/core/router';
import {
  UseInfiniteQueryResult,
  UseMutationResult,
  UseQueryResult,
} from 'react-query';
import {
  UseTRPCInfiniteQueryOptions,
  UseTRPCMutationOptions,
  UseTRPCQueryOptions,
  createReactQueryHooks,
} from './createReactQueryHooks';

type inferProcedureClientError<T extends Procedure<any>> =
  inferProcedureParams<T>['_config']['errorShape'];

type NeverKeys<T> = {
  [TKey in keyof T]: T[TKey] extends never ? TKey : never;
}[keyof T];
type OmitNeverKeys<T> = Omit<T, NeverKeys<T>>;

type DecorateProcedure<
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

type DecoratedProcedureRecord<
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

export function createReactQueryProxy<
  TRouter extends AnyRouter,
  TSSRContext = unknown,
>() {
  const trpc = createReactQueryHooks<TRouter, TSSRContext>();

  const proxy = createProxy({
    target: trpc,
    callback(opts) {
      const args = opts.args;
      const pathCopy = [...opts.path];
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const type = pathCopy.pop()!;
      const fullPath = pathCopy.join('.');
      if (type === 'useMutation') {
        return (trpc as any)[type](fullPath, ...args);
      }
      if (!type.startsWith('use')) {
        throw new Error(`Invalid hook call`);
      }
      const [input, ...rest] = args;

      return (trpc as any)[type]([fullPath, input], ...rest);
    },
  });

  return proxy as DecoratedProcedureRecord<TRouter['_def']['record']>;
}
