import {
  UseInfiniteQueryResult,
  UseMutationResult,
  UseQueryResult,
} from '@tanstack/react-query';
import { TRPCClientErrorLike } from '@trpc/client';
import {
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnyRouter,
  AnySubscriptionProcedure,
  ProcedureRouterRecord,
  inferProcedureInput,
  inferProcedureOutput,
} from '@trpc/server';
import { inferObservableValue } from '@trpc/server/observable';
import { useMemo } from 'react';
import {
  CreateReactUtilsProxy,
  createReactProxyDecoration,
  createReactQueryUtilsProxy,
} from './shared';
import {
  CreateClient,
  CreateReactQueryHooks,
  TRPCProvider,
  UseDehydratedState,
  UseTRPCInfiniteQueryOptions,
  UseTRPCMutationOptions,
  UseTRPCQueryOptions,
  UseTRPCSubscriptionOptions,
  createHooksInternal,
} from './shared/hooks/createHooksInternal';

/**
 * @internal
 */
export type DecorateProcedure<
  TProcedure extends AnyProcedure,
  TPath extends string,
> = TProcedure extends AnyQueryProcedure
  ? {
      useQuery: <
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
      ) => UseQueryResult<TData, TRPCClientErrorLike<TProcedure>>;
    } & (inferProcedureInput<TProcedure> extends { cursor?: any }
      ? {
          useInfiniteQuery: <
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
          ) => UseInfiniteQueryResult<TData, TRPCClientErrorLike<TProcedure>>;
        }
      : {})
  : TProcedure extends AnyMutationProcedure
  ? {
      useMutation: <TContext = unknown>(
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
      >;
    }
  : TProcedure extends AnySubscriptionProcedure
  ? {
      useSubscription: (
        input: inferProcedureInput<TProcedure>,
        opts?: UseTRPCSubscriptionOptions<
          inferObservableValue<inferProcedureOutput<TProcedure>>,
          TRPCClientErrorLike<TProcedure>
        >,
      ) => void;
    }
  : never;

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
    : TProcedures[TKey] extends AnyProcedure
    ? DecorateProcedure<TProcedures[TKey], `${TPath}${TKey & string}`>
    : never;
};

export type CreateTRPCReact<TRouter extends AnyRouter, TSSRContext> = {
  useContext(): CreateReactUtilsProxy<TRouter, TSSRContext>;
  Provider: TRPCProvider<TRouter, TSSRContext>;
  createClient: CreateClient<TRouter>;
  useDehydratedState: UseDehydratedState<TRouter>;
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
        if (name === 'then') {
          return undefined;
        }
        if (name === 'useContext') {
          return () => {
            const context = trpc.useContext();
            // create a stable reference of the utils context
            return useMemo(() => {
              return (createReactQueryUtilsProxy as any)(context as any);
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
