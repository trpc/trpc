import {
  DehydratedState,
  InfiniteQueryObserverSuccessResult,
  QueryObserverSuccessResult,
  QueryOptions,
  UseInfiniteQueryOptions,
  UseInfiniteQueryResult,
  UseMutationOptions,
  UseMutationResult,
  UseQueryOptions,
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

export interface UseTRPCQueryOptions<TPath, TInput, TOutput, TData, TError>
  extends UseQueryOptions<TOutput, TError, TData, [TPath, TInput]>,
    TRPCUseQueryBaseOptions {}

export interface TRPCQueryOptions<TPath, TInput, TData, TError>
  extends QueryOptions<TData, TError, TData, [TPath, TInput]>,
    TRPCUseQueryBaseOptions {}

export interface UseTRPCInfiniteQueryOptions<TPath, TInput, TOutput, TError>
  extends UseInfiniteQueryOptions<
      TOutput,
      TError,
      TOutput,
      TOutput,
      [TPath, TInput]
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

export type UseTRPCQueryResult<TData, TError> = UseQueryResult<TData, TError> &
  TRPCHookResult;
/**
 * @internal
 */

export type UseTRPCQuerySuccessResult<TData, TError> =
  QueryObserverSuccessResult<TData, TError> & TRPCHookResult;
/**
 * @internal
 */
export type UseTRPCInfiniteQueryResult<TData, TError> = UseInfiniteQueryResult<
  TData,
  TError
> &
  TRPCHookResult;
/**
 * @internal
 */

export type UseTRPCInfiniteQuerySuccessResult<TData, TError> =
  InfiniteQueryObserverSuccessResult<TData, TError> & TRPCHookResult;
/**
 * @internal
 */

export type UseTRPCMutationResult<TData, TError, TVariables, TContext> =
  UseMutationResult<TData, TError, TVariables, TContext> & TRPCHookResult;
