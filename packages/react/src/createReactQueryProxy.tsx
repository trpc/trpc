import {
  AnyRouter,
  Procedure,
  RecursiveProcedureRecord,
  inferProcedureInput,
  inferProcedureOutput,
} from '@trpc/server';
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

type FIXME_GET_ERROR = never;
type inferProcedureClientError<_T extends Procedure<any>> = FIXME_GET_ERROR;

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
  TProcedures extends RecursiveProcedureRecord,
  TPath extends string = '',
> = OmitNeverKeys<{
  [TKey in keyof TProcedures]: TProcedures[TKey] extends RecursiveProcedureRecord
    ? DecoratedProcedureRecord<TProcedures[TKey], `${TPath}${TKey & string}.`>
    : DecorateProcedure<
        assertProcedure<TProcedures[TKey & string]>,
        `${TPath}${TKey & string}`
      >;
}>;

function makeProxy<
  TRouter extends AnyRouter,
  TClient extends { useContext: any; Provider: any },
>(client: TClient, ...path: string[]) {
  const proxy: any = new Proxy(
    function () {
      // noop
    },
    {
      get(_obj, name) {
        if (name in client && !path.length) {
          return client[name as keyof typeof client];
        }
        if (typeof name === 'string') {
          // @ts-expect-error "excessively infinite"
          return makeProxy(client, ...path, name) as any;
        }

        return client;
      },
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      apply(_1, _2, args) {
        const pathCopy = [...path];
        const type = pathCopy.pop()!;
        const fullPath = pathCopy.join('.');

        if (type === 'useMutation') {
          return (client as any)[type](fullPath, ...args);
        }
        if (!type.startsWith('use')) {
          throw new Error(`Invalid hook call`);
        }
        const [input, ...rest] = args;

        return (client as any)[type]([fullPath, input], ...rest);
      },
    },
  );

  return proxy as DecoratedProcedureRecord<TRouter['_def']['procedures']> &
    Pick<TClient, 'Provider'>;
}
export function createReactQueryProxy<
  TRouter extends AnyRouter,
  TSSRContext = unknown,
>() {
  const trpc = createReactQueryHooks<TRouter, TSSRContext>();

  return makeProxy<TRouter, typeof trpc>(trpc);
}
