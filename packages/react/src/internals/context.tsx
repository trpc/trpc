import { TRPCClient, TRPCClientError } from '@trpc/client';
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
    pathAndArgs: [path: TPath, ...args: inferHandlerInput<TProcedure>],
    opts?: FetchQueryOptions<TInput, TRPCClientError<TRouter>, TOutput>,
  ) => Promise<TOutput>;
  fetchInfiniteQuery: <
    TPath extends keyof TRouter['_def']['queries'] & string,
    TProcedure extends TRouter['_def']['queries'][TPath],
    TOutput extends inferProcedureOutput<TProcedure>,
    TInput extends inferProcedureInput<TProcedure>,
  >(
    pathAndArgs: [path: TPath, ...args: inferHandlerInput<TProcedure>],
    opts?: FetchInfiniteQueryOptions<TInput, TRPCClientError<TRouter>, TOutput>,
  ) => Promise<InfiniteData<TOutput>>;
  prefetchQuery: <
    TPath extends keyof TRouter['_def']['queries'] & string,
    TProcedure extends TRouter['_def']['queries'][TPath],
    TOutput extends inferProcedureOutput<TProcedure>,
    TInput extends inferProcedureInput<TProcedure>,
  >(
    pathAndArgs: [path: TPath, ...args: inferHandlerInput<TProcedure>],
    opts?: FetchQueryOptions<TInput, TRPCClientError<TRouter>, TOutput>,
  ) => Promise<void>;

  prefetchInfiniteQuery: <
    TPath extends keyof TRouter['_def']['queries'] & string,
    TProcedure extends TRouter['_def']['queries'][TPath],
    TOutput extends inferProcedureOutput<TProcedure>,
    TInput extends inferProcedureInput<TProcedure>,
  >(
    pathAndArgs: [path: TPath, ...args: inferHandlerInput<TProcedure>],
    opts?: FetchInfiniteQueryOptions<TInput, TRPCClientError<TRouter>, TOutput>,
  ) => Promise<void>;

  invalidateQuery: <
    TPath extends keyof TRouter['_def']['queries'] & string,
    TInput extends inferProcedureInput<TRouter['_def']['queries'][TPath]>,
  >(
    pathAndArgs: [TPath, TInput?],
  ) => Promise<void>;
  cancelQuery: <
    TPath extends keyof TRouter['_def']['queries'] & string,
    TInput extends inferProcedureInput<TRouter['_def']['queries'][TPath]>,
  >(
    pathAndArgs: [TPath, TInput?],
  ) => Promise<void>;
  setQueryData: <
    TPath extends keyof TRouter['_def']['queries'] & string,
    TInput extends inferProcedureInput<TRouter['_def']['queries'][TPath]>,
    TOutput extends inferProcedureOutput<TRouter['_def']['queries'][TPath]>,
  >(
    pathAndArgs: [TPath, TInput?],
    output: TOutput,
  ) => void;
  getQueryData: <
    TPath extends keyof TRouter['_def']['queries'] & string,
    TInput extends inferProcedureInput<TRouter['_def']['queries'][TPath]>,
    TOutput extends inferProcedureOutput<TRouter['_def']['queries'][TPath]>,
  >(
    pathAndArgs: [TPath, TInput?],
  ) => TOutput | undefined;
};

export const TRPCContext = createContext(null as any);
