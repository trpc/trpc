import type {
  DefinedInitialDataInfiniteOptions,
  DefinedUseInfiniteQueryResult,
  InfiniteData,
  SkipToken,
  UndefinedInitialDataInfiniteOptions,
  UseInfiniteQueryOptions,
  UseInfiniteQueryResult,
  UseSuspenseInfiniteQueryOptions,
  UseSuspenseInfiniteQueryResult,
  UseSuspenseQueryResult,
} from '@tanstack/react-query';
import type { createTRPCClient, TRPCClientErrorLike } from '@trpc/client';
import type { ClientContext } from '@trpc/client/internals/types';
import type {
  AnyProcedure,
  AnyRootTypes,
  AnyRouter,
  inferAsyncIterableYield,
  inferProcedureInput,
  inferTransformedProcedureOutput,
  ProcedureType,
  ProtectedIntersection,
  RouterRecord,
  Simplify,
} from '@trpc/server/unstable-core-do-not-import';
import { createFlatProxy } from '@trpc/server/unstable-core-do-not-import';
import * as React from 'react';
import type {
  TRPCUseQueries,
  TRPCUseSuspenseQueries,
} from './internals/useQueries';
import type {
  CreateReactUtils,
  TRPCFetchInfiniteQueryOptions,
  TRPCFetchQueryOptions,
} from './shared';
import { createReactDecoration, createReactQueryUtils } from './shared';
import type { CreateReactQueryHooks } from './shared/hooks/createHooksInternal';
import { createRootHooks } from './shared/hooks/createHooksInternal';
import type {
  DefinedUseTRPCQueryOptions,
  DefinedUseTRPCQueryResult,
  TRPCHookResult,
  TRPCProvider,
  TRPCSubscriptionResult,
  TRPCUseQueryBaseOptions,
  UseTRPCMutationOptions,
  UseTRPCMutationResult,
  UseTRPCQueryOptions,
  UseTRPCQueryResult,
  UseTRPCSubscriptionOptions,
  UseTRPCSuspenseQueryOptions,
} from './shared/hooks/types';
import type { CreateTRPCReactOptions } from './shared/types';

type ResolverDef = {
  input: any;
  output: any;
  transformer: boolean;
  errorShape: any;
};
/**
 * @internal
 */
export interface ProcedureUseQuery<TDef extends ResolverDef> {
  <TQueryFnData extends TDef['output'] = TDef['output'], TData = TQueryFnData>(
    input: TDef['input'] | SkipToken,
    opts: DefinedUseTRPCQueryOptions<
      TQueryFnData,
      TData,
      TRPCClientErrorLike<{
        errorShape: TDef['errorShape'];
        transformer: TDef['transformer'];
      }>,
      TDef['output']
    >,
  ): DefinedUseTRPCQueryResult<
    TData,
    TRPCClientErrorLike<{
      errorShape: TDef['errorShape'];
      transformer: TDef['transformer'];
    }>
  >;

  <TQueryFnData extends TDef['output'] = TDef['output'], TData = TQueryFnData>(
    input: TDef['input'] | SkipToken,
    opts?: UseTRPCQueryOptions<
      TQueryFnData,
      TData,
      TRPCClientErrorLike<TDef>,
      TDef['output']
    >,
  ): UseTRPCQueryResult<TData, TRPCClientErrorLike<TDef>>;
}

/**
 * @internal
 */
export type ProcedureUsePrefetchQuery<TDef extends ResolverDef> = (
  input: TDef['input'] | SkipToken,
  opts?: TRPCFetchQueryOptions<TDef['output'], TRPCClientErrorLike<TDef>>,
) => void;

/**
 * @remark `void` is here due to https://github.com/trpc/trpc/pull/4374
 */
type CursorInput = {
  cursor?: any;
} | void;

type ReservedInfiniteQueryKeys = 'cursor' | 'direction';
type InfiniteInput<TInput> =
  | Omit<TInput, ReservedInfiniteQueryKeys>
  | SkipToken;

type inferCursorType<TInput> = TInput extends { cursor?: any }
  ? TInput['cursor']
  : unknown;

type makeInfiniteQueryOptions<
  TCursor,
  TOptions,
  TContext extends ClientContext,
> = Omit<
  TOptions,
  'queryKey' | 'initialPageParam' | 'queryFn' | 'queryHash' | 'queryHashFn'
> &
  TRPCUseQueryBaseOptions<TContext> & {
    initialCursor?: TCursor;
  };

type trpcInfiniteData<TDef extends ResolverDef> = Simplify<
  InfiniteData<TDef['output'], inferCursorType<TDef['input']>>
>;
// references from react-query
// 1st
// declare function useInfiniteQuery<
//   TQueryFnData,
//   TError = DefaultError,
//   TData = InfiniteData<TQueryFnData>,
//   TQueryKey extends QueryKey = QueryKey,
//   TPageParam = unknown,
// >(
//   options: DefinedInitialDataInfiniteOptions<
//     TQueryFnData,
//     TError,
//     TData,
//     TQueryKey,
//     TPageParam
//   >,
//   queryClient?: QueryClient,
// ): DefinedUseInfiniteQueryResult<TData, TError>;
// 2nd
// declare function useInfiniteQuery<
//   TQueryFnData,
//   TError = DefaultError,
//   TData = InfiniteData<TQueryFnData>,
//   TQueryKey extends QueryKey = QueryKey,
//   TPageParam = unknown,
// >(
//   options: UndefinedInitialDataInfiniteOptions<
//     TQueryFnData,
//     TError,
//     TData,
//     TQueryKey,
//     TPageParam
//   >,
//   queryClient?: QueryClient,
// ): UseInfiniteQueryResult<TData, TError>;
// 3rd
// declare function useInfiniteQuery<
//   TQueryFnData,
//   TError = DefaultError,
//   TData = InfiniteData<TQueryFnData>,
//   TQueryKey extends QueryKey = QueryKey,
//   TPageParam = unknown,
// >(
//   options: UseInfiniteQueryOptions<
//     TQueryFnData,
//     TError,
//     TData,
//     TQueryFnData,
//     TQueryKey,
//     TPageParam
//   >,
//   queryClient?: QueryClient,
// ): UseInfiniteQueryResult<TData, TError>;

export interface useTRPCInfiniteQuery<
  TDef extends ResolverDef,
  TContext extends ClientContext,
> {
  // 1st
  <TData = trpcInfiniteData<TDef>>(
    input: InfiniteInput<TDef['input']>,
    opts: makeInfiniteQueryOptions<
      inferCursorType<TDef['input']>,
      DefinedInitialDataInfiniteOptions<
        //     TQueryFnData,
        TDef['output'],
        //     TError,
        TRPCClientErrorLike<TDef>,
        //     TData,
        TData,
        //     TQueryKey,
        any,
        //     TPageParam
        inferCursorType<TDef['input']>
      >,
      TContext
    >,
  ): TRPCHookResult &
    DefinedUseInfiniteQueryResult<TData, TRPCClientErrorLike<TDef>>;

  // 2nd
  <
    TData = trpcInfiniteData<TDef>,
    TContext extends ClientContext = ClientContext,
  >(
    input: InfiniteInput<TDef['input']>,
    opts?: makeInfiniteQueryOptions<
      inferCursorType<TDef['input']>,
      UndefinedInitialDataInfiniteOptions<
        //     TQueryFnData,
        TDef['output'],
        //     TError,
        TRPCClientErrorLike<TDef>,
        //     TData,
        TData,
        //     TQueryKey,
        any,
        //     TPageParam
        inferCursorType<TDef['input']>
      >,
      TContext
    >,
  ): TRPCHookResult & UseInfiniteQueryResult<TData, TRPCClientErrorLike<TDef>>;

  // 3rd:
  <
    TData = trpcInfiniteData<TDef>,
    TContext extends ClientContext = ClientContext,
  >(
    input: InfiniteInput<TDef['input']>,
    opts?: makeInfiniteQueryOptions<
      inferCursorType<TDef['input']>,
      UseInfiniteQueryOptions<
        //     TQueryFnData,
        TDef['output'],
        //     TError,
        TRPCClientErrorLike<TDef>,
        //     TData,
        TData,
        //     TQueryFnData,
        TDef['output'],
        //     TQueryKey,
        any,
        //     TPageParam
        inferCursorType<TDef['input']>
      >,
      TContext
    >,
  ): TRPCHookResult & UseInfiniteQueryResult<TData, TRPCClientErrorLike<TDef>>;
}

// references from react-query
// declare function useSuspenseInfiniteQuery<
//   TQueryFnData,
//   TError = DefaultError,
//   TData = InfiniteData<TQueryFnData>,
//   TQueryKey extends QueryKey = QueryKey,
//   TPageParam = unknown,
// >(
//   options: UseSuspenseInfiniteQueryOptions<
//     TQueryFnData,
//     TError,
//     TData,
//     TQueryFnData,
//     TQueryKey,
//     TPageParam
//   >,
//   queryClient?: QueryClient,
// ): UseSuspenseInfiniteQueryResult<TData, TError>;

export type useTRPCSuspenseInfiniteQuery<
  TDef extends ResolverDef,
  TContext extends ClientContext,
> = (
  input: InfiniteInput<TDef['input']>,
  opts: makeInfiniteQueryOptions<
    inferCursorType<TDef['input']>,
    UseSuspenseInfiniteQueryOptions<
      //     TQueryFnData,
      TDef['output'],
      //     TError,
      TRPCClientErrorLike<TDef>,
      //     TData,
      trpcInfiniteData<TDef>,
      //     TQueryFnData,
      TDef['output'],
      //     TQueryKey,
      any,
      //     TPageParam
      inferCursorType<TDef['input']>
    >,
    TContext
  >,
) => [
  trpcInfiniteData<TDef>,
  TRPCHookResult &
    UseSuspenseInfiniteQueryResult<
      trpcInfiniteData<TDef>,
      TRPCClientErrorLike<TDef>
    >,
];

/**
 * @internal
 */
export type MaybeDecoratedInfiniteQuery<
  TDef extends ResolverDef,
  TContext extends ClientContext,
> = TDef['input'] extends CursorInput
  ? {
      /**
       * @see https://trpc.io/docs/v11/client/react/useInfiniteQuery
       */
      useInfiniteQuery: useTRPCInfiniteQuery<TDef, TContext>;
      /**
       * @see https://trpc.io/docs/client/react/suspense#usesuspenseinfinitequery
       */
      useSuspenseInfiniteQuery: useTRPCSuspenseInfiniteQuery<TDef, TContext>;

      usePrefetchInfiniteQuery: (
        input: Omit<TDef['input'], ReservedInfiniteQueryKeys> | SkipToken,
        opts: TRPCFetchInfiniteQueryOptions<
          TDef['input'],
          TDef['output'],
          TRPCClientErrorLike<TDef>
        >,
      ) => void;
    }
  : object;

/**
 * @internal
 */
export type DecoratedQueryMethods<
  TDef extends ResolverDef,
  TContext extends ClientContext,
> = {
  /**
   * @see https://trpc.io/docs/v11/client/react/useQuery
   */
  useQuery: ProcedureUseQuery<TDef>;
  usePrefetchQuery: ProcedureUsePrefetchQuery<TDef>;
  /**
   * @see https://trpc.io/docs/v11/client/react/suspense#usesuspensequery
   */
  useSuspenseQuery: <
    TQueryFnData extends TDef['output'] = TDef['output'],
    TData = TQueryFnData,
  >(
    input: TDef['input'],
    opts?: UseTRPCSuspenseQueryOptions<
      TQueryFnData,
      TData,
      TRPCClientErrorLike<TDef>,
      TContext
    >,
  ) => [
    TData,
    UseSuspenseQueryResult<TData, TRPCClientErrorLike<TDef>> & TRPCHookResult,
  ];
};

/**
 * @internal
 */
export type DecoratedQuery<
  TDef extends ResolverDef,
  TContext extends ClientContext,
> = MaybeDecoratedInfiniteQuery<TDef, TContext> &
  DecoratedQueryMethods<TDef, TContext>;

export type DecoratedMutation<
  TDef extends ResolverDef,
  TContext extends ClientContext,
> = {
  /**
   * @see https://trpc.io/docs/v11/client/react/useMutation
   */
  useMutation: <TMutationContext extends TContext = TContext>(
    opts?: UseTRPCMutationOptions<
      TDef['input'],
      TRPCClientErrorLike<TDef>,
      TDef['output'],
      TMutationContext
    >,
  ) => UseTRPCMutationResult<
    TDef['output'],
    TRPCClientErrorLike<TDef>,
    TDef['input'],
    TMutationContext
  >;
};

interface ProcedureUseSubscription<TDef extends ResolverDef> {
  // Without skip token
  (
    input: TDef['input'],
    opts?: UseTRPCSubscriptionOptions<
      inferAsyncIterableYield<TDef['output']>,
      TRPCClientErrorLike<TDef>
    >,
  ): Exclude<
    TRPCSubscriptionResult<
      inferAsyncIterableYield<TDef['output']>,
      TRPCClientErrorLike<TDef>
    >,
    // The idle state is
    | {
        status: 'idle';
      }
    | {
        connectionState: 'idle';
      }
  >;

  // With skip token
  (
    input: TDef['input'] | SkipToken,
    opts?: Omit<
      UseTRPCSubscriptionOptions<
        inferAsyncIterableYield<TDef['output']>,
        TRPCClientErrorLike<TDef>
      >,
      'enabled'
    >,
  ): TRPCSubscriptionResult<
    inferAsyncIterableYield<TDef['output']>,
    TRPCClientErrorLike<TDef>
  >;
}
/**
 * @internal
 */
export type DecorateProcedure<
  TType extends ProcedureType,
  TDef extends ResolverDef,
  TContext extends ClientContext,
> = TType extends 'query'
  ? DecoratedQuery<TDef, TContext>
  : TType extends 'mutation'
    ? DecoratedMutation<TDef, TContext>
    : TType extends 'subscription'
      ? {
          /**
           * @see https://trpc.io/docs/v11/subscriptions
           */
          useSubscription: ProcedureUseSubscription<TDef>;
        }
      : never;

/**
 * @internal
 */
export type DecorateRouterRecord<
  TRoot extends AnyRootTypes,
  TRecord extends RouterRecord,
  TContext extends ClientContext,
> = {
  [TKey in keyof TRecord]: TRecord[TKey] extends infer $Value
    ? $Value extends AnyProcedure
      ? DecorateProcedure<
          $Value['_def']['type'],
          {
            input: inferProcedureInput<$Value>;
            output: inferTransformedProcedureOutput<TRoot, $Value>;
            transformer: TRoot['transformer'];
            errorShape: TRoot['errorShape'];
          },
          TContext
        >
      : $Value extends RouterRecord
        ? DecorateRouterRecord<TRoot, $Value, TContext>
        : never
    : never;
};

/**
 * @internal
 */
export type CreateTRPCReactBase<
  TRouter extends AnyRouter,
  TSSRContext,
  TContext extends ClientContext,
> = {
  /**
   * @deprecated renamed to `useUtils` and will be removed in a future tRPC version
   *
   * @see https://trpc.io/docs/v11/client/react/useUtils
   */
  useContext(): CreateReactUtils<TRouter, TSSRContext>;
  /**
   * @see https://trpc.io/docs/v11/client/react/useUtils
   */
  useUtils(): CreateReactUtils<TRouter, TSSRContext>;
  Provider: TRPCProvider<TRouter, TSSRContext, TContext>;
  createClient: typeof createTRPCClient<TRouter, TContext>;
  useQueries: TRPCUseQueries<TRouter>;
  useSuspenseQueries: TRPCUseSuspenseQueries<TRouter>;
};

export type CreateTRPCReact<
  TRouter extends AnyRouter,
  TSSRContext,
  TContext extends ClientContext,
> = ProtectedIntersection<
  CreateTRPCReactBase<TRouter, TSSRContext, TContext>,
  DecorateRouterRecord<
    TRouter['_def']['_config']['$types'],
    TRouter['_def']['record'],
    TContext
  >
>;

/**
 * @internal
 */
export function createHooksInternal<
  TRouter extends AnyRouter,
  TContext extends ClientContext,
  TSSRContext = unknown,
>(trpc: CreateReactQueryHooks<TRouter, TSSRContext>) {
  type CreateHooksInternal = CreateTRPCReact<TRouter, TSSRContext, TContext>;

  const proxy = createReactDecoration<TRouter, TSSRContext>(
    trpc,
  ) as DecorateRouterRecord<
    TRouter['_def']['_config']['$types'],
    TRouter['_def']['record'],
    TContext
  >;
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

    return proxy[key];
  });
}

export function createTRPCReact<
  TRouter extends AnyRouter,
  TContext extends ClientContext,
  TSSRContext = unknown,
>(
  opts?: CreateTRPCReactOptions<TRouter>,
): CreateTRPCReact<TRouter, TSSRContext, TContext> {
  const hooks = createRootHooks<TRouter, TSSRContext>(opts);
  const proxy = createHooksInternal<TRouter, TContext, TSSRContext>(hooks);

  return proxy as any;
}
