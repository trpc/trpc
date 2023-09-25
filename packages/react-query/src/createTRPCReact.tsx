import { TRPCClientErrorLike } from '@trpc/client';
import {
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnyRootConfig,
  AnyRouter,
  AnySubscriptionProcedure,
  inferProcedureInput,
  ProcedureRouterRecord,
  ProtectedIntersection,
} from '@trpc/server';
import {
  createFlatProxy,
  inferTransformedProcedureOutput,
  inferTransformedSubscriptionOutput,
} from '@trpc/server/shared';
import { useMemo } from 'react';
import { TRPCUseQueries } from './internals/useQueries';
import {
  createReactProxyDecoration,
  createReactQueryUtilsProxy,
  CreateReactUtilsProxy,
} from './shared';
import {
  CreateReactQueryHooks,
  createRootHooks,
} from './shared/hooks/createHooksInternal';
import {
  CreateClient,
  DefinedUseTRPCQueryOptions,
  DefinedUseTRPCQueryResult,
  TRPCProvider,
  UseDehydratedState,
  UseTRPCInfiniteQueryOptions,
  UseTRPCInfiniteQueryResult,
  UseTRPCMutationOptions,
  UseTRPCMutationResult,
  UseTRPCQueryOptions,
  UseTRPCQueryResult,
  UseTRPCSubscriptionOptions,
  UseTRPCSuspenseInfiniteQueryOptions,
  UseTRPCSuspenseInfiniteQueryResult,
  UseTRPCSuspenseQueryOptions,
  UseTRPCSuspenseQueryResult,
} from './shared/hooks/types';
import { CreateTRPCReactOptions } from './shared/types';

/**
 * @internal
 */
export interface ProcedureUseQuery<
  TConfig extends AnyRootConfig,
  TProcedure extends AnyProcedure,
> {
  <
    TQueryFnData extends inferTransformedProcedureOutput<
      TConfig,
      TProcedure
    > = inferTransformedProcedureOutput<TConfig, TProcedure>,
    TData = TQueryFnData,
  >(
    input: inferProcedureInput<TProcedure>,
    opts: DefinedUseTRPCQueryOptions<
      TQueryFnData,
      TData,
      TRPCClientErrorLike<TConfig>,
      inferTransformedProcedureOutput<TConfig, TProcedure>
    >,
  ): DefinedUseTRPCQueryResult<TData, TRPCClientErrorLike<TConfig>>;

  <
    TQueryFnData extends inferTransformedProcedureOutput<
      TConfig,
      TProcedure
    > = inferTransformedProcedureOutput<TConfig, TProcedure>,
    TData = TQueryFnData,
  >(
    input: inferProcedureInput<TProcedure>,
    opts?: UseTRPCQueryOptions<
      TQueryFnData,
      TData,
      TRPCClientErrorLike<TConfig>,
      inferTransformedProcedureOutput<TConfig, TProcedure>
    >,
  ): UseTRPCQueryResult<TData, TRPCClientErrorLike<TConfig>>;
}

/**
 * @remark `void` is here due to https://github.com/trpc/trpc/pull/4374
 */
type CursorInput = {
  cursor?: any;
} | void;

/**
 * @internal
 */
export type MaybeDecoratedInfiniteQuery<
  TProcedure extends AnyProcedure,
  TConfig extends AnyRootConfig,
> = inferProcedureInput<TProcedure> extends CursorInput
  ? {
      /**
       * @see https://trpc.io/docs/client/react/suspense#useinfinitesuspensequery
       */
      useInfiniteQuery: (
        input: Omit<inferProcedureInput<TProcedure>, 'cursor'>,
        opts: UseTRPCInfiniteQueryOptions<
          inferProcedureInput<TProcedure>,
          inferTransformedProcedureOutput<TConfig, TProcedure>,
          TRPCClientErrorLike<TConfig>
        >,
      ) => UseTRPCInfiniteQueryResult<
        inferTransformedProcedureOutput<TConfig, TProcedure>,
        TRPCClientErrorLike<TConfig>,
        inferProcedureInput<TProcedure>
      >;
      /**
       * @see https://trpc.io/docs/client/react/suspense
       */
      useSuspenseInfiniteQuery: (
        input: Omit<inferProcedureInput<TProcedure>, 'cursor'>,
        opts: UseTRPCSuspenseInfiniteQueryOptions<
          inferProcedureInput<TProcedure>,
          inferTransformedProcedureOutput<TConfig, TProcedure>,
          TRPCClientErrorLike<TConfig>
        >,
      ) => UseTRPCSuspenseInfiniteQueryResult<
        inferTransformedProcedureOutput<TConfig, TProcedure>,
        TRPCClientErrorLike<TConfig>,
        inferProcedureInput<TProcedure>
      >;
    }
  : object;

/**
 * @internal
 */
export type DecoratedQueryMethods<
  TConfig extends AnyRootConfig,
  TProcedure extends AnyProcedure,
> = {
  /**
   * @see https://trpc.io/docs/client/react/useQuery
   */
  useQuery: ProcedureUseQuery<TConfig, TProcedure>;
  /**
   * @see https://trpc.io/docs/client/react/suspense#usesuspensequery
   */
  useSuspenseQuery: <
    TQueryFnData extends inferTransformedProcedureOutput<
      TConfig,
      TProcedure
    > = inferTransformedProcedureOutput<TConfig, TProcedure>,
    TData = TQueryFnData,
  >(
    input: inferProcedureInput<TProcedure>,
    opts?: UseTRPCSuspenseQueryOptions<
      TQueryFnData,
      TData,
      TRPCClientErrorLike<TConfig>
    >,
  ) => UseTRPCSuspenseQueryResult<TData, TRPCClientErrorLike<TConfig>>;
};

/**
 * @internal
 */
export type DecoratedQuery<
  TConfig extends AnyRootConfig,
  TProcedure extends AnyProcedure,
> = MaybeDecoratedInfiniteQuery<TProcedure, TConfig> &
  DecoratedQueryMethods<TConfig, TProcedure>;

/**
 * @internal
 */
export interface DecoratedMutation<
  TConfig extends AnyRootConfig,
  TProcedure extends AnyProcedure,
> {
  /**
   * @see https://trpc.io/docs/client/react/useMutation
   */
  useMutation: <TContext = unknown>(
    opts?: UseTRPCMutationOptions<
      inferProcedureInput<TProcedure>,
      TRPCClientErrorLike<TConfig>,
      inferTransformedProcedureOutput<TConfig, TProcedure>,
      TContext
    >,
  ) => UseTRPCMutationResult<
    inferTransformedProcedureOutput<TConfig, TProcedure>,
    TRPCClientErrorLike<TConfig>,
    inferProcedureInput<TProcedure>,
    TContext
  >;
}

/**
 * @internal
 */
export type DecorateProcedure<
  TConfig extends AnyRootConfig,
  TProcedure extends AnyProcedure,
  _TFlags,
> = TProcedure extends AnyQueryProcedure
  ? DecoratedQuery<TConfig, TProcedure>
  : TProcedure extends AnyMutationProcedure
  ? DecoratedMutation<TConfig, TProcedure>
  : TProcedure extends AnySubscriptionProcedure
  ? {
      /**
       * @see https://trpc.io/docs/subscriptions
       */
      useSubscription: (
        input: inferProcedureInput<TProcedure>,
        opts?: UseTRPCSubscriptionOptions<
          inferTransformedSubscriptionOutput<TConfig, TProcedure>,
          TRPCClientErrorLike<TConfig>
        >,
      ) => void;
    }
  : never;

/**
 * @internal
 */
export type DecoratedProcedureRecord<
  TConfig extends AnyRootConfig,
  TProcedures extends ProcedureRouterRecord,
  TFlags,
> = {
  [TKey in keyof TProcedures]: TProcedures[TKey] extends AnyRouter
    ? DecoratedProcedureRecord<
        TConfig,
        TProcedures[TKey]['_def']['record'],
        TFlags
      >
    : TProcedures[TKey] extends AnyProcedure
    ? DecorateProcedure<TConfig, TProcedures[TKey], TFlags>
    : never;
};

/**
 * @internal
 */
export type CreateTRPCReactBase<TRouter extends AnyRouter, TSSRContext> = {
  /**
   * @see https://trpc.io/docs/client/react/useContext
   */
  useContext(): CreateReactUtilsProxy<TRouter, TSSRContext>;
  Provider: TRPCProvider<TRouter, TSSRContext>;
  createClient: CreateClient<TRouter>;
  useQueries: TRPCUseQueries<TRouter>;
  useDehydratedState: UseDehydratedState<TRouter>;
};

export type CreateTRPCReact<
  TRouter extends AnyRouter,
  TSSRContext,
  TFlags,
> = ProtectedIntersection<
  CreateTRPCReactBase<TRouter, TSSRContext>,
  DecoratedProcedureRecord<
    TRouter['_def']['_config'],
    TRouter['_def']['record'],
    TFlags
  >
>;

/**
 * @internal
 */
export function createHooksInternalProxy<
  TRouter extends AnyRouter,
  TSSRContext = unknown,
  TFlags = null,
>(trpc: CreateReactQueryHooks<TRouter, TSSRContext>) {
  type CreateHooksInternalProxy = CreateTRPCReact<TRouter, TSSRContext, TFlags>;

  return createFlatProxy<CreateHooksInternalProxy>((key) => {
    if (key === 'useContext') {
      return () => {
        const context = trpc.useContext();
        // create a stable reference of the utils context
        return useMemo(() => {
          return (createReactQueryUtilsProxy as any)(context);
        }, [context]);
      };
    }

    if (trpc.hasOwnProperty(key)) {
      return (trpc as any)[key];
    }

    return createReactProxyDecoration(key, trpc);
  });
}

export function createTRPCReact<
  TRouter extends AnyRouter,
  TSSRContext = unknown,
  TFlags = null,
>(
  opts?: CreateTRPCReactOptions<TRouter>,
): CreateTRPCReact<TRouter, TSSRContext, TFlags> {
  const hooks = createRootHooks<TRouter, TSSRContext>(opts);
  const proxy = createHooksInternalProxy<TRouter, TSSRContext, TFlags>(hooks);

  return proxy as any;
}
