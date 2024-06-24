import type {
  DefinedInitialDataInfiniteOptions,
  DefinedUseInfiniteQueryResult,
  InfiniteData,
  SkipToken,
  UndefinedInitialDataInfiniteOptions,
  UseInfiniteQueryOptions,
  UseInfiniteQueryResult,
} from '@tanstack/react-query';
import type { TRPCClientErrorLike } from '@trpc/client';
import type { Simplify } from '@trpc/server/unstable-core-do-not-import';
import type { TRPCHookResult, TRPCUseQueryBaseOptions } from '../types';

/**
 * @remark `void` is here due to https://github.com/trpc/trpc/pull/4374
 */
export type CursorInput = {
  cursor?: any;
} | void;

type ResolverDef = {
  input: CursorInput;
  output: any;
  transformer: boolean;
  errorShape: any;
};

type InfiniteInput<TInput> = Omit<TInput, 'cursor' | 'direction'> | SkipToken;

export type inferCursorType<TInput> = TInput extends { cursor?: any }
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
        //     TQueryFnData,
        TDef['output'],
        //     TQueryKey,
        any,
        //     TPageParam
        inferCursorType<TDef['input']>
      >
    >,
  ): TRPCHookResult & UseInfiniteQueryResult<TData, TRPCClientErrorLike<TDef>>;
}
