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

type makeInfiniteQueryOptions<TCursor, TOptions> = Omit<
  TOptions,
  'queryKey' | 'initialPageParam' | 'queryFn' | 'queryHash' | 'queryHashFn'
> &
  TRPCUseQueryBaseOptions & {
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

export interface useTRPCInfiniteQuery<TDef extends ResolverDef> {
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
      >
    >,
  ): TRPCHookResult &
    DefinedUseInfiniteQueryResult<TData, TRPCClientErrorLike<TDef>>;

  // 2nd
  <TData = trpcInfiniteData<TDef>>(
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
      >
    >,
  ): TRPCHookResult & UseInfiniteQueryResult<TData, TRPCClientErrorLike<TDef>>;

  // 3rd:
  <TData = trpcInfiniteData<TDef>>(
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
        //     TQueryKey,
        any,
        //     TPageParam
        inferCursorType<TDef['input']>
      >
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

export type useTRPCSuspenseInfiniteQuery<TDef extends ResolverDef> = (
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
      //     TQueryKey,
      any,
      //     TPageParam
      inferCursorType<TDef['input']>
    >
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
export type MaybeDecoratedInfiniteQuery<TDef extends ResolverDef> =
  TDef['input'] extends CursorInput
    ? {
        /**
         * @see https://trpc.io/docs/v11/client/react/useInfiniteQuery
         */
        useInfiniteQuery: useTRPCInfiniteQuery<TDef>;
        /**
         * @see https://trpc.io/docs/client/react/suspense#usesuspenseinfinitequery
         */
        useSuspenseInfiniteQuery: useTRPCSuspenseInfiniteQuery<TDef>;

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
export type DecoratedQueryMethods<TDef extends ResolverDef> = {
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
      TRPCClientErrorLike<TDef>
    >,
  ) => [
    TData,
    UseSuspenseQueryResult<TData, TRPCClientErrorLike<TDef>> & TRPCHookResult,
  ];
};

/**
 * @internal
 */
export type DecoratedQuery<TDef extends ResolverDef> =
  MaybeDecoratedInfiniteQuery<TDef> & DecoratedQueryMethods<TDef>;

export type DecoratedMutation<TDef extends ResolverDef> = {
  /**
   * @see https://trpc.io/docs/v11/client/react/useMutation
   */
  useMutation: <TContext = unknown>(
    opts?: UseTRPCMutationOptions<
      TDef['input'],
      TRPCClientErrorLike<TDef>,
      TDef['output'],
      TContext
    >,
  ) => UseTRPCMutationResult<
    TDef['output'],
    TRPCClientErrorLike<TDef>,
    TDef['input'],
    TContext
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
  ): TRPCSubscriptionResult<
    inferAsyncIterableYield<TDef['output']>,
    TRPCClientErrorLike<TDef>
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
> = TType extends 'query'
  ? DecoratedQuery<TDef>
  : TType extends 'mutation'
    ? DecoratedMutation<TDef>
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
          }
        >
      : $Value extends RouterRecord
        ? DecorateRouterRecord<TRoot, $Value>
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
   * @see https://trpc.io/docs/v11/client/react/useUtils
   */
  useContext(): CreateReactUtils<TRouter, TSSRContext>;
  /**
   * @see https://trpc.io/docs/v11/client/react/useUtils
   */
  useUtils(): CreateReactUtils<TRouter, TSSRContext>;
  Provider: TRPCProvider<TRouter, TSSRContext>;
  createClient: typeof createTRPCClient<TRouter>;
  useQueries: TRPCUseQueries<TRouter>;
  useSuspenseQueries: TRPCUseSuspenseQueries<TRouter>;
};

export type CreateTRPCReact<
  TRouter extends AnyRouter,
  TSSRContext,
> = ProtectedIntersection<
  CreateTRPCReactBase<TRouter, TSSRContext>,
  DecorateRouterRecord<
    TRouter['_def']['_config']['$types'],
    TRouter['_def']['record']
  >
>;

/**
 * @internal
 */
export function createHooksInternal<
  TRouter extends AnyRouter,
  TSSRContext = unknown,
>(trpc: CreateReactQueryHooks<TRouter, TSSRContext>) {
  type CreateHooksInternal = CreateTRPCReact<TRouter, TSSRContext>;

  const proxy = createReactDecoration<TRouter, TSSRContext>(
    trpc,
  ) as DecorateRouterRecord<
    TRouter['_def']['_config']['$types'],
    TRouter['_def']['record']
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
  TSSRContext = unknown,
>(
  opts?: CreateTRPCReactOptions<TRouter>,
): CreateTRPCReact<TRouter, TSSRContext> {
  const hooks = createRootHooks<TRouter, TSSRContext>(opts);
  const proxy = createHooksInternal<TRouter, TSSRContext>(hooks);

  return proxy as any;
}
