import type { TRPCClientErrorLike } from '@trpc/client';
import type {
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnyRootTypes,
  AnyRouter,
  AnySubscriptionProcedure,
  inferProcedureInput,
  inferTransformedProcedureOutput,
  inferTransformedSubscriptionOutput,
  ProtectedIntersection,
  RouterRecord,
} from '@trpc/server/unstable-core-do-not-import';
import { createFlatProxy } from '@trpc/server/unstable-core-do-not-import';
import * as React from 'react';
import type {
  TRPCUseQueries,
  TRPCUseSuspenseQueries,
} from './internals/useQueries';
import type { CreateReactUtils } from './shared';
import { createReactDecoration, createReactQueryUtils } from './shared';
import type { CreateReactQueryHooks } from './shared/hooks/createHooksInternal';
import { createRootHooks } from './shared/hooks/createHooksInternal';
import type {
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
import type { CreateTRPCReactOptions } from './shared/types';

/**
 * @internal
 */
export interface ProcedureUseQuery<
  TRoot extends AnyRootTypes,
  TProcedure extends AnyProcedure,
> {
  <
    TQueryFnData extends inferTransformedProcedureOutput<
      TRoot,
      TProcedure
    > = inferTransformedProcedureOutput<TRoot, TProcedure>,
    TData = TQueryFnData,
  >(
    input: inferProcedureInput<TProcedure>,
    opts: DefinedUseTRPCQueryOptions<
      TQueryFnData,
      TData,
      TRPCClientErrorLike<TRoot>,
      inferTransformedProcedureOutput<TRoot, TProcedure>
    >,
  ): DefinedUseTRPCQueryResult<TData, TRPCClientErrorLike<TRoot>>;

  <
    TQueryFnData extends inferTransformedProcedureOutput<
      TRoot,
      TProcedure
    > = inferTransformedProcedureOutput<TRoot, TProcedure>,
    TData = TQueryFnData,
  >(
    input: inferProcedureInput<TProcedure>,
    opts?: UseTRPCQueryOptions<
      TQueryFnData,
      TData,
      TRPCClientErrorLike<TRoot>,
      inferTransformedProcedureOutput<TRoot, TProcedure>
    >,
  ): UseTRPCQueryResult<TData, TRPCClientErrorLike<TRoot>>;
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
  TRoot extends AnyRootTypes,
> = inferProcedureInput<TProcedure> extends CursorInput
  ? {
      /**
       * @link https://trpc.io/docs/v11/client/react/suspense#useinfinitesuspensequery
       */
      useInfiniteQuery: (
        input: Omit<inferProcedureInput<TProcedure>, 'cursor'>,
        opts: UseTRPCInfiniteQueryOptions<
          inferProcedureInput<TProcedure>,
          inferTransformedProcedureOutput<TRoot, TProcedure>,
          TRPCClientErrorLike<TRoot>
        >,
      ) => UseTRPCInfiniteQueryResult<
        inferTransformedProcedureOutput<TRoot, TProcedure>,
        TRPCClientErrorLike<TRoot>,
        inferProcedureInput<TProcedure>
      >;
      /**
       * @link https://trpc.io/docs/v11/client/react/suspense
       */
      useSuspenseInfiniteQuery: (
        input: Omit<inferProcedureInput<TProcedure>, 'cursor'>,
        opts: UseTRPCSuspenseInfiniteQueryOptions<
          inferProcedureInput<TProcedure>,
          inferTransformedProcedureOutput<TRoot, TProcedure>,
          TRPCClientErrorLike<TRoot>
        >,
      ) => UseTRPCSuspenseInfiniteQueryResult<
        inferTransformedProcedureOutput<TRoot, TProcedure>,
        TRPCClientErrorLike<TRoot>,
        inferProcedureInput<TProcedure>
      >;
    }
  : object;

/**
 * @internal
 */
export type DecoratedQueryMethods<
  TRoot extends AnyRootTypes,
  TProcedure extends AnyProcedure,
> = {
  /**
   * @link https://trpc.io/docs/v11/client/react/useQuery
   */
  useQuery: ProcedureUseQuery<TRoot, TProcedure>;
  /**
   * @link https://trpc.io/docs/v11/client/react/suspense#usesuspensequery
   */
  useSuspenseQuery: <
    TQueryFnData extends inferTransformedProcedureOutput<
      TRoot,
      TProcedure
    > = inferTransformedProcedureOutput<TRoot, TProcedure>,
    TData = TQueryFnData,
  >(
    input: inferProcedureInput<TProcedure>,
    opts?: UseTRPCSuspenseQueryOptions<
      TQueryFnData,
      TData,
      TRPCClientErrorLike<TRoot>
    >,
  ) => UseTRPCSuspenseQueryResult<TData, TRPCClientErrorLike<TRoot>>;
};

/**
 * @internal
 */
export type DecoratedQuery<
  TRoot extends AnyRootTypes,
  TProcedure extends AnyProcedure,
> = MaybeDecoratedInfiniteQuery<TProcedure, TRoot> &
  DecoratedQueryMethods<TRoot, TProcedure>;

/**
 * @internal
 */
export interface DecoratedMutation<
  TRoot extends AnyRootTypes,
  TProcedure extends AnyProcedure,
> {
  /**
   * @link https://trpc.io/docs/v11/client/react/useMutation
   */
  useMutation: <TContext = unknown>(
    opts?: UseTRPCMutationOptions<
      inferProcedureInput<TProcedure>,
      TRPCClientErrorLike<TRoot>,
      inferTransformedProcedureOutput<TRoot, TProcedure>,
      TContext
    >,
  ) => UseTRPCMutationResult<
    inferTransformedProcedureOutput<TRoot, TProcedure>,
    TRPCClientErrorLike<TRoot>,
    inferProcedureInput<TProcedure>,
    TContext
  >;
}

/**
 * @internal
 */
export type DecorateProcedure<
  TRoot extends AnyRootTypes,
  TProcedure extends AnyProcedure,
  _TFlags,
> = TProcedure extends AnyQueryProcedure
  ? DecoratedQuery<TRoot, TProcedure>
  : TProcedure extends AnyMutationProcedure
  ? DecoratedMutation<TRoot, TProcedure>
  : TProcedure extends AnySubscriptionProcedure
  ? {
      /**
       * @link https://trpc.io/docs/v11/subscriptions
       */
      useSubscription: (
        input: inferProcedureInput<TProcedure>,
        opts?: UseTRPCSubscriptionOptions<
          inferTransformedSubscriptionOutput<TRoot, TProcedure>,
          TRPCClientErrorLike<TRoot>
        >,
      ) => void;
    }
  : never;

/**
 * @internal
 */
export type DecoratedProcedureRecord<
  TRoot extends AnyRootTypes,
  TRecord extends RouterRecord,
  TFlags,
> = {
  [TKey in keyof TRecord]: TRecord[TKey] extends infer $Item
    ? $Item extends RouterRecord
      ? DecoratedProcedureRecord<TRoot, $Item, TFlags>
      : $Item extends AnyProcedure
      ? DecorateProcedure<TRoot, $Item, TFlags>
      : never
    : never;
};

/**
 * @internal
 */
export type CreateTRPCReactBase<TRouter extends AnyRouter, TSSRContext> = {
  /**
   * @deprecated renamed to `useUtils` and will be removed in a future tRPC version
   *
   * @link https://trpc.io/docs/v11/client/react/useUtils
   */
  useContext(): CreateReactUtils<TRouter, TSSRContext>;
  /**
   * @link https://trpc.io/docs/v11/client/react/useUtils
   */
  useUtils(): CreateReactUtils<TRouter, TSSRContext>;
  Provider: TRPCProvider<TRouter, TSSRContext>;
  createClient: CreateClient<TRouter>;
  useQueries: TRPCUseQueries<TRouter>;
  useSuspenseQueries: TRPCUseSuspenseQueries<TRouter>;
  useDehydratedState: UseDehydratedState<TRouter>;
};

export type CreateTRPCReact<
  TRouter extends AnyRouter,
  TSSRContext,
  TFlags,
> = ProtectedIntersection<
  CreateTRPCReactBase<TRouter, TSSRContext>,
  DecoratedProcedureRecord<
    TRouter['_def']['_config']['$types'],
    TRouter['_def']['record'],
    TFlags
  >
>;

/**
 * @internal
 */
export function createHooksInternal<
  TRouter extends AnyRouter,
  TSSRContext = unknown,
  TFlags = null,
>(trpc: CreateReactQueryHooks<TRouter, TSSRContext>) {
  type CreateHooksInternal = CreateTRPCReact<TRouter, TSSRContext, TFlags>;

  return createFlatProxy<CreateHooksInternal>((key) => {
    if (key === 'useContext' || key === 'useUtils') {
      return () => {
        const context = trpc.useUtils();
        // create a stable reference of the utils context
        return React.useMemo(() => {
          return (createReactQueryUtils as any)(context);
        }, [context]);
      };
    }

    if (trpc.hasOwnProperty(key)) {
      return (trpc as any)[key];
    }

    return createReactDecoration(key, trpc);
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
  const proxy = createHooksInternal<TRouter, TSSRContext, TFlags>(hooks);

  return proxy as any;
}
