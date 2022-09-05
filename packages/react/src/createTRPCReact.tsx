import {
  UseInfiniteQueryResult,
  UseMutationResult,
  UseQueryResult,
} from '@tanstack/react-query';
import { TRPCClientErrorLike } from '@trpc/client';
import {
  AnyRouter,
  OmitNeverKeys,
  Procedure,
  ProcedureRouterRecord,
  inferProcedureInput,
  inferProcedureOutput,
} from '@trpc/server';
import { inferObservableValue } from '@trpc/server/observable';
import { LegacyV9ProcedureTag } from '@trpc/server/shared';
import { useMemo } from 'react';
import {
  DecoratedProcedureUtilsRecord,
  createReactProxyDecoration,
  createReactQueryUtilsProxy,
} from './shared';
import {
  CreateReactQueryHooks,
  TRPCProviderProps,
  UseTRPCInfiniteQueryOptions,
  UseTRPCMutationOptions,
  UseTRPCQueryOptions,
  UseTRPCSubscriptionOptions,
  createHooksInternal,
} from './shared/hooks/createHooksInternal';

type DecorateProcedure<
  TProcedure extends Procedure<any>,
  TPath extends string,
> = OmitNeverKeys<{
  useQuery: TProcedure extends { _query: true }
    ? <
        TQueryFnData = inferProcedureOutput<TProcedure>,
        TData = inferProcedureOutput<TProcedure>,
      >(
        input: inferProcedureInput<TProcedure>,
        opts?: UseTRPCQueryOptions<
          TPath,
          inferProcedureInput<TProcedure>,
          TQueryFnData,
          TData,
          TRPCClientErrorLike<TProcedure>
        >,
      ) => UseQueryResult<TData, TRPCClientErrorLike<TProcedure>>
    : never;

  useInfiniteQuery: TProcedure extends { _query: true }
    ? inferProcedureInput<TProcedure> extends {
        cursor?: any;
      }
      ? <
          _TQueryFnData = inferProcedureOutput<TProcedure>,
          TData = inferProcedureOutput<TProcedure>,
        >(
          input: Omit<inferProcedureInput<TProcedure>, 'cursor'>,
          opts?: UseTRPCInfiniteQueryOptions<
            TPath,
            inferProcedureInput<TProcedure>,
            TData,
            TRPCClientErrorLike<TProcedure>
          >,
        ) => UseInfiniteQueryResult<TData, TRPCClientErrorLike<TProcedure>>
      : never
    : never;

  useMutation: TProcedure extends { _mutation: true }
    ? <TContext = unknown>(
        opts?: UseTRPCMutationOptions<
          inferProcedureInput<TProcedure>,
          TRPCClientErrorLike<TProcedure>,
          inferProcedureOutput<TProcedure>,
          TContext
        >,
      ) => UseMutationResult<
        inferProcedureOutput<TProcedure>,
        TRPCClientErrorLike<TProcedure>,
        inferProcedureInput<TProcedure>,
        TContext
      >
    : never;

  useSubscription: TProcedure extends { _subscription: true }
    ? (
        input: inferProcedureInput<TProcedure>,
        opts?: UseTRPCSubscriptionOptions<
          inferObservableValue<inferProcedureOutput<TProcedure>>,
          TRPCClientErrorLike<TProcedure>
        >,
      ) => void
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
  [TKey in keyof TProcedures]: TProcedures[TKey] extends LegacyV9ProcedureTag
    ? never
    : TProcedures[TKey] extends AnyRouter
    ? DecoratedProcedureRecord<
        TProcedures[TKey]['_def']['record'],
        `${TPath}${TKey & string}.`
      >
    : DecorateProcedure<
        assertProcedure<TProcedures[TKey]>,
        `${TPath}${TKey & string}`
      >;
};

export type CreateTRPCReact<TRouter extends AnyRouter, TSSRContext> = {
  useContext(): DecoratedProcedureUtilsRecord<TRouter>;
  Provider(props: TRPCProviderProps<TRouter, TSSRContext>): JSX.Element;
} & DecoratedProcedureRecord<TRouter['_def']['record']>;

/**
 * @internal
 */
export function createHooksInternalProxy<
  TRouter extends AnyRouter,
  TSSRContext = unknown,
>(trpc: CreateReactQueryHooks<TRouter, TSSRContext>) {
  const proxy: unknown = new Proxy(
    () => {
      // noop
    },
    {
      get(_obj, name) {
        if (name === 'useContext') {
          return () => {
            const context = trpc.useContext();
            // create a stable reference of the utils context
            return useMemo(() => {
              return createReactQueryUtilsProxy(context as any);
            }, [context]);
          };
        }

        if (name in trpc) {
          return (trpc as any)[name];
        }

        if (typeof name === 'string') {
          return createReactProxyDecoration(name, trpc);
        }

        throw new Error('Not supported');
      },
    },
  );

  return proxy as CreateTRPCReact<TRouter, TSSRContext>;
}

export function createTRPCReact<
  TRouter extends AnyRouter,
  TSSRContext = unknown,
>() {
  const hooks = createHooksInternal<TRouter, TSSRContext>();
  const proxy = createHooksInternalProxy<TRouter, TSSRContext>(hooks);

  return proxy;
}
