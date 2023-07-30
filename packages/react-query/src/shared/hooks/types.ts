import {
  DefinedUseQueryResult,
  DehydratedState,
  InfiniteData,
  InfiniteQueryObserverSuccessResult,
  InitialDataFunction,
  QueryObserverSuccessResult,
  QueryOptions,
  UseBaseQueryOptions,
  UseInfiniteQueryOptions,
  UseInfiniteQueryResult,
  UseMutationOptions,
  UseMutationResult,
  UseQueryResult,
} from '@tanstack/react-query';
import {
  CreateTRPCClientOptions,
  TRPCRequestOptions,
  TRPCUntypedClient,
} from '@trpc/client';
import { AnyRouter } from '@trpc/server';
import { ReactNode } from 'react';
import { TRPCContextProps } from '../../internals/context';
import { TRPCQueryKey } from '../../internals/getQueryKey';
import { TRPCHookResult } from '../../internals/useHookResult';

export type OutputWithCursor<TData, TCursor = any> = {
  cursor: TCursor | null;
  data: TData;
};

export interface TRPCReactRequestOptions
  // For RQ, we use their internal AbortSignals instead of letting the user pass their own
  extends Omit<TRPCRequestOptions, 'signal'> {
  /**
   * Opt out of SSR for this query by passing `ssr: false`
   */
  ssr?: boolean;
  /**
   * Opt out or into aborting request on unmount
   */
  abortOnUnmount?: boolean;
}

export interface TRPCUseQueryBaseOptions {
  /**
   * tRPC-related options
   */
  trpc?: TRPCReactRequestOptions;
}

export interface UseTRPCQueryOptions<
  TPath,
  TInput,
  TOutput,
  TData,
  TError,
  TQueryOptsData = TOutput,
> extends Omit<
      UseBaseQueryOptions<
        TOutput,
        TError,
        TData,
        TQueryOptsData,
        [TPath, TInput]
      >,
      'queryKey'
    >,
    TRPCUseQueryBaseOptions {}

/** @internal **/
export interface DefinedUseTRPCQueryOptions<
  TPath,
  TInput,
  TOutput,
  TData,
  TError,
  TQueryOptsData = TOutput,
> extends Omit<
    UseTRPCQueryOptions<TPath, TInput, TOutput, TData, TError, TQueryOptsData>,
    'queryKey'
  > {
  initialData: InitialDataFunction<TQueryOptsData> | TQueryOptsData;
}

export interface TRPCQueryOptions<TPath, TInput, TData, TError>
  extends Omit<QueryOptions<TData, TError, TData, [TPath, TInput]>, 'queryKey'>,
    TRPCUseQueryBaseOptions {
  queryKey: TRPCQueryKey;
}

export type ExtractCursorType<TInput> = TInput extends { cursor: any }
  ? TInput['cursor']
  : unknown;

export interface UseTRPCInfiniteQueryOptions<TPath, TInput, TOutput, TError>
  extends Omit<
      UseInfiniteQueryOptions<
        TOutput,
        TError,
        TOutput,
        TOutput,
        [TPath, Omit<TInput, 'cursor'>]
      >,
      'queryKey'
    >,
    TRPCUseQueryBaseOptions {}

export interface UseTRPCMutationOptions<
  TInput,
  TError,
  TOutput,
  TContext = unknown,
> extends UseMutationOptions<TOutput, TError, TInput, TContext>,
    TRPCUseQueryBaseOptions {}

export interface UseTRPCSubscriptionOptions<TOutput, TError> {
  enabled?: boolean;
  onStarted?: () => void;
  onData: (data: TOutput) => void;
  onError?: (err: TError) => void;
}
export interface TRPCProviderProps<TRouter extends AnyRouter, TSSRContext>
  extends TRPCContextProps<TRouter, TSSRContext> {
  children: ReactNode;
}

export type TRPCProvider<TRouter extends AnyRouter, TSSRContext> = (
  props: TRPCProviderProps<TRouter, TSSRContext>,
) => JSX.Element;

export type UseDehydratedState<TRouter extends AnyRouter> = (
  client: TRPCUntypedClient<TRouter>,
  trpcState: DehydratedState | undefined,
) => DehydratedState | undefined;

export type CreateClient<TRouter extends AnyRouter> = (
  opts: CreateTRPCClientOptions<TRouter>,
) => TRPCUntypedClient<TRouter>;

/**
 * @internal
 */
export type UseTRPCQueryResult<TData, TError> = TRPCHookResult &
  UseQueryResult<TData, TError>;

/**
 * @internal
 */
export type DefinedUseTRPCQueryResult<TData, TError> = DefinedUseQueryResult<
  TData,
  TError
> &
  TRPCHookResult;

/**
 * @internal
 */
export type UseTRPCQuerySuccessResult<TData, TError> =
  QueryObserverSuccessResult<TData, TError> & TRPCHookResult;

/**
 * @internal
 */
export type UseTRPCInfiniteQueryResult<TData, TError> = TRPCHookResult &
  UseInfiniteQueryResult<InfiniteData<TData>, TError>;

/**
 * @internal
 */
export type UseTRPCInfiniteQuerySuccessResult<TData, TError> =
  InfiniteQueryObserverSuccessResult<InfiniteData<TData>, TError> &
    TRPCHookResult;

/**
 * @internal
 */
export type UseTRPCMutationResult<TData, TError, TVariables, TContext> =
  TRPCHookResult & UseMutationResult<TData, TError, TVariables, TContext>;
