import type {
  DefinedInitialDataInfiniteOptions,
  DefinedUseInfiniteQueryResult,
  InfiniteData,
  SkipToken,
  UndefinedInitialDataInfiniteOptions,
  useInfiniteQuery,
  UseInfiniteQueryOptions,
  UseInfiniteQueryResult,
} from '@tanstack/react-query';
import type { TRPCClientErrorLike } from '@trpc/client';
import type { DistributiveOmit } from '@trpc/server/unstable-core-do-not-import';
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

type ReservedInfiniteQueryKeys = 'cursor' | 'direction';

type InputForDef<TDef extends ResolverDef> =
  | Omit<TDef['input'], ReservedInfiniteQueryKeys>
  | SkipToken;

export type ExtractCursorType<TInput> = TInput extends { cursor?: any }
  ? TInput['cursor']
  : unknown;

type makeOptions<TDef extends ResolverDef, TOptions> = Omit<
  TOptions,
  'queryKey' | 'initialPageParam' | 'queryFn' | 'queryHash' | 'queryKeyHashFn'
> &
  TRPCUseQueryBaseOptions & {
    initialCursor?: ExtractCursorType<TDef['input']>;
  };

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
  <TQueryFnData = TDef['output'], TData = InfiniteData<TQueryFnData>>(
    input: InputForDef<TDef>,
    opts: makeOptions<
      TDef,
      DefinedInitialDataInfiniteOptions<
        //     TQueryFnData,
        TQueryFnData,
        //     TError,
        TRPCClientErrorLike<TDef>,
        //     TData,
        TQueryFnData,
        //     TQueryKey,
        any,
        //     TPageParam
        ExtractCursorType<TDef['input']>
      >
    >,
  ): DefinedUseInfiniteQueryResult<
    TData,
    TRPCClientErrorLike<{
      errorShape: TDef['errorShape'];
      transformer: TDef['transformer'];
    }>
  > &
    TRPCHookResult;

  // 2nd
  <TQueryFnData = TDef['output'], TData = InfiniteData<TQueryFnData>>(
    input: InputForDef<TDef>,
    opts?: makeOptions<
      TDef,
      UndefinedInitialDataInfiniteOptions<
        //     TQueryFnData,
        TQueryFnData,
        //     TError,
        TRPCClientErrorLike<TDef>,
        //     TData,
        TQueryFnData,
        //     TQueryKey,
        any,
        //     TPageParam
        ExtractCursorType<TDef['input']>
      >
    >,
  ): UseInfiniteQueryResult<TData, TRPCClientErrorLike<TDef>> & TRPCHookResult;

  // 3rd:
  <TQueryFnData = TDef['output'], TData = InfiniteData<TQueryFnData>>(
    input: InputForDef<TDef>,
    opts?: makeOptions<
      TDef,
      UseInfiniteQueryOptions<
        //     TQueryFnData,
        TQueryFnData,
        //     TError,
        TRPCClientErrorLike<TDef>,
        //     TData,
        TQueryFnData,
        //     TQueryFnData,
        TQueryFnData,
        //     TQueryKey,
        any,
        //     TPageParam
        ExtractCursorType<TDef['input']>
      >
    >,
  ): UseInfiniteQueryResult<TData, TRPCClientErrorLike<TDef>> & TRPCHookResult;
}
