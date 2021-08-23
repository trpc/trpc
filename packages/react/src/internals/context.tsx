import { TRPCClient, TRPCClientError, TRPCRequestOptions } from '@trpc/client';
import type {
  AnyRouter,
  inferHandlerInput,
  inferProcedureInput,
  inferProcedureOutput,
} from '@trpc/server';
import { createContext } from 'react';
import {
  FetchInfiniteQueryOptions,
  FetchQueryOptions,
  InfiniteData,
  QueryClient,
} from 'react-query';

interface TRPCFetchQueryOptions<TInput, TError, TOutput>
  extends FetchQueryOptions<TInput, TError, TOutput>,
    TRPCRequestOptions {}

interface TRPCFetchInfiniteQueryOptions<TInput, TError, TOutput>
  extends FetchInfiniteQueryOptions<TInput, TError, TOutput>,
    TRPCRequestOptions {}

export type TRPCContextState<TRouter extends AnyRouter> = {
  queryClient: QueryClient;
  client: TRPCClient<TRouter>;
  isPrepass: boolean;

  fetchQuery: <
    TPath extends keyof TRouter['_def']['queries'] & string,
    TProcedure extends TRouter['_def']['queries'][TPath],
    TOutput extends inferProcedureOutput<TProcedure>,
    TInput extends inferProcedureInput<TProcedure>,
  >(
    pathAndInput: [path: TPath, ...args: inferHandlerInput<TProcedure>],
    opts?: TRPCFetchQueryOptions<TInput, TRPCClientError<TRouter>, TOutput>,
  ) => Promise<TOutput>;
  fetchInfiniteQuery: <
    TPath extends keyof TRouter['_def']['queries'] & string,
    TProcedure extends TRouter['_def']['queries'][TPath],
    TOutput extends inferProcedureOutput<TProcedure>,
    TInput extends inferProcedureInput<TProcedure>,
  >(
    pathAndInput: [path: TPath, ...args: inferHandlerInput<TProcedure>],
    opts?: TRPCFetchInfiniteQueryOptions<
      TInput,
      TRPCClientError<TRouter>,
      TOutput
    >,
  ) => Promise<InfiniteData<TOutput>>;
  prefetchQuery: <
    TPath extends keyof TRouter['_def']['queries'] & string,
    TProcedure extends TRouter['_def']['queries'][TPath],
    TOutput extends inferProcedureOutput<TProcedure>,
    TInput extends inferProcedureInput<TProcedure>,
  >(
    pathAndInput: [path: TPath, ...args: inferHandlerInput<TProcedure>],
    opts?: TRPCFetchQueryOptions<TInput, TRPCClientError<TRouter>, TOutput>,
  ) => Promise<void>;

  prefetchInfiniteQuery: <
    TPath extends keyof TRouter['_def']['queries'] & string,
    TProcedure extends TRouter['_def']['queries'][TPath],
    TOutput extends inferProcedureOutput<TProcedure>,
    TInput extends inferProcedureInput<TProcedure>,
  >(
    pathAndInput: [path: TPath, ...args: inferHandlerInput<TProcedure>],
    opts?: TRPCFetchInfiniteQueryOptions<
      TInput,
      TRPCClientError<TRouter>,
      TOutput
    >,
  ) => Promise<void>;

  invalidateQuery: <
    TPath extends keyof TRouter['_def']['queries'] & string,
    TInput extends inferProcedureInput<TRouter['_def']['queries'][TPath]>,
  >(
    pathAndInput: [TPath, TInput?],
  ) => Promise<void>;
  cancelQuery: <
    TPath extends keyof TRouter['_def']['queries'] & string,
    TInput extends inferProcedureInput<TRouter['_def']['queries'][TPath]>,
  >(
    pathAndInput: [TPath, TInput?],
  ) => Promise<void>;
  setQueryData: <
    TPath extends keyof TRouter['_def']['queries'] & string,
    TInput extends inferProcedureInput<TRouter['_def']['queries'][TPath]>,
    TOutput extends inferProcedureOutput<TRouter['_def']['queries'][TPath]>,
  >(
    pathAndInput: [TPath, TInput?],
    output: TOutput,
  ) => void;
  getQueryData: <
    TPath extends keyof TRouter['_def']['queries'] & string,
    TInput extends inferProcedureInput<TRouter['_def']['queries'][TPath]>,
    TOutput extends inferProcedureOutput<TRouter['_def']['queries'][TPath]>,
  >(
    pathAndInput: [TPath, TInput?],
  ) => TOutput | undefined;
};

export const TRPCContext = createContext(null as any);
