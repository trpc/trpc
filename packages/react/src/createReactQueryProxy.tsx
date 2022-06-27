import {
  AnyRouter,
  Procedure,
  inferProcedureInput,
  inferProcedureOutput,
} from '@trpc/server';
import {
  UseInfiniteQueryResult,
  UseMutationResult,
  UseQueryResult,
} from 'react-query';
import {
  ProcedureRecord,
  UseTRPCInfiniteQueryOptions,
  UseTRPCMutationOptions,
  UseTRPCQueryOptions,
  createReactQueryHooks,
} from './createReactQueryHooks';

type FIXME_GET_ERROR = never;
type inferProcedureClientError<_T extends Procedure<any>> = FIXME_GET_ERROR;

type Join<T extends ReadonlyArray<any>, D extends string> = T extends []
  ? ''
  : T extends [string]
  ? `${T[0]}`
  : T extends [string, ...infer R]
  ? `${T[0]}${D}${Join<R, D>}`
  : string;
type NeverKeys<T> = {
  [TKey in keyof T]: T[TKey] extends never ? TKey : never;
}[keyof T];
type OmitNeverKeys<T> = Omit<T, NeverKeys<T>>;
type DecorateProcedures<
  TRecord extends ProcedureRecord,
  TPrefix extends string[],
> = {
  [TPath in keyof TRecord]: OmitNeverKeys<{
    useQuery: TRecord[TPath] extends { _query: true }
      ? <
          TQueryFnData = inferProcedureOutput<TRecord[TPath]>,
          TData = inferProcedureOutput<TRecord[TPath]>,
        >(
          ...args: [
            inferProcedureInput<TRecord[TPath]>,
            void | UseTRPCQueryOptions<
              Join<[...TPrefix, TPath], '.'>,
              inferProcedureInput<TRecord[TPath]>,
              TQueryFnData,
              TData,
              inferProcedureClientError<TRecord[TPath]>
            >,
          ]
        ) => UseQueryResult<TData, inferProcedureClientError<TRecord[TPath]>>
      : never;

    useMutation: TRecord[TPath] extends { _mutation: true }
      ? <TContext = unknown>(
          opts?: UseTRPCMutationOptions<
            inferProcedureInput<TRecord[TPath]>,
            inferProcedureClientError<TRecord[TPath]>,
            inferProcedureOutput<TRecord[TPath]>,
            TContext
          >,
        ) => UseMutationResult<
          inferProcedureOutput<TRecord[TPath]>,
          inferProcedureClientError<TRecord[TPath]>,
          inferProcedureInput<TRecord[TPath]>,
          TContext
        >
      : never;

    useInfiniteQuery: TRecord[TPath] extends { _query: true }
      ? inferProcedureInput<TRecord[TPath]> extends {
          cursor?: any;
        }
        ? <
            _TQueryFnData = inferProcedureOutput<TRecord[TPath]>,
            TData = inferProcedureOutput<TRecord[TPath]>,
          >(
            ...args: [
              Omit<inferProcedureInput<TRecord[TPath]>, 'cursor'>,
              void | UseTRPCInfiniteQueryOptions<
                Join<[...TPrefix, TPath], '.'>,
                inferProcedureInput<TRecord[TPath]>,
                TData,
                inferProcedureClientError<TRecord[TPath]>
              >,
            ]
          ) => UseInfiniteQueryResult<
            TData,
            inferProcedureClientError<TRecord[TPath]>
          >
        : never
      : never;
  }>;
};
type FlattenRouter<
  TRouter extends AnyRouter,
  TPath extends string[] = [],
> = DecorateProcedures<TRouter['_def']['procedures'], TPath> & {
  [TKey in keyof TRouter['_def']['children']]: FlattenRouter<
    TRouter['_def']['children'][TKey],
    [...TPath, TKey & string]
  >;
};
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
          return makeProxy(client, ...path, name);
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

  return proxy as FlattenRouter<TRouter> & Pick<TClient, 'Provider'>;
}
export function createReactQueryProxy<
  TRouter extends AnyRouter,
  TSSRContext = unknown,
>() {
  const trpc = createReactQueryHooks<TRouter, TSSRContext>();

  return makeProxy<TRouter, typeof trpc>(trpc);
}
