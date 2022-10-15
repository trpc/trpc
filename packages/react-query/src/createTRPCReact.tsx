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
import { createFlatProxy } from '@trpc/server/shared';
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
  UseTRPCInfiniteQueryResult,
  UseTRPCMutationOptions,
  UseTRPCMutationResult,
  UseTRPCQueryOptions,
  UseTRPCQueryResult,
  UseTRPCSubscriptionOptions,
  createHooksInternal,
} from './shared/hooks/createHooksInternal';
import { CreateTRPCReactOptions } from './shared/types';

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
      ) => UseTRPCQueryResult<TData, TRPCClientErrorLike<TProcedure>>;
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
          ) => UseTRPCInfiniteQueryResult<
            TData,
            TRPCClientErrorLike<TProcedure>
          >;
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
      ) => UseTRPCMutationResult<
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
  type CreateHooksInternalProxy = CreateTRPCReact<TRouter, TSSRContext>;

  return createFlatProxy<CreateHooksInternalProxy>((key) => {
    if (key === 'useContext') {
      return () => {
        const context = trpc.useContext();
        // create a stable reference of the utils context
        return useMemo(() => {
          return (createReactQueryUtilsProxy as any)(context as any);
        }, [context]);
      };
    }

    if ((key as string) in trpc) {
      return (trpc as any)[key];
    }

    return createReactProxyDecoration(key as string, trpc);
  });
}

export function createTRPCReact<
  TRouter extends AnyRouter,
  TSSRContext = unknown,
>(opts?: CreateTRPCReactOptions<TRouter>) {
  const hooks = createHooksInternal<TRouter, TSSRContext>(opts);
  const proxy = createHooksInternalProxy<TRouter, TSSRContext>(hooks);

  return proxy;
}
