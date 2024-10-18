import type { MutationFunction } from '@tanstack/react-query';
import {
  type QueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';
import type { TRPCClientError, TRPCUntypedClient } from '@trpc/client';
import type {
  AnyMutationProcedure,
  AnyRootTypes,
  AnyRouter,
  DistributiveOmit,
  inferProcedureInput,
  inferTransformedProcedureOutput,
  MaybePromise,
} from '@trpc/server/unstable-core-do-not-import';
import type {
  TRPCMutationKey,
  TRPCQueryBaseOptions,
  TRPCQueryOptionsResult,
} from './types';
import {
  createTRPCOptionsResult,
  getClientArgs,
  getMutationKeyInternal,
} from './utils';

type ReservedOptions = 'mutationKey' | 'mutationFn';

interface TRPCMutationOptionsIn<TInput, TError, TOutput, TContext>
  extends DistributiveOmit<
      UseMutationOptions<TOutput, TError, TInput, TContext>,
      ReservedOptions
    >,
    TRPCQueryBaseOptions {}

interface TRPCMutationOptionsOut<TInput, TError, TOutput, TContext>
  extends UseMutationOptions<TOutput, TError, TInput, TContext>,
    TRPCQueryOptionsResult {
  mutationKey: TRPCMutationKey;
}

export interface TRPCMutationOptions<
  TRoot extends AnyRootTypes,
  TProcedure extends AnyMutationProcedure,
> {
  <TContext = unknown>(
    opts: TRPCMutationOptionsIn<
      inferProcedureInput<TProcedure>,
      TRPCClientError<TRoot>,
      inferTransformedProcedureOutput<TRoot, TProcedure>,
      TContext
    >,
  ): TRPCMutationOptionsOut<
    inferProcedureInput<TProcedure>,
    TRPCClientError<TRoot>,
    inferTransformedProcedureOutput<TRoot, TProcedure>,
    TContext
  >;
}

/**
 * @internal
 */
export interface MutationOptionsOverride {
  onSuccess: (opts: {
    /**
     * Calls the original function that was defined in the query's `onSuccess` option
     */
    originalFn: () => MaybePromise<unknown>;
    queryClient: QueryClient;
    /**
     * Meta data passed in from the `useMutation()` hook
     */
    meta: Record<string, unknown>;
  }) => MaybePromise<unknown>;
}

export function trpcMutationOptions(args: {
  untypedClient: TRPCUntypedClient<AnyRouter>;
  queryClient: QueryClient;
  path: readonly string[];
  opts: TRPCMutationOptionsIn<unknown, unknown, unknown, unknown>;
  overrides: MutationOptionsOverride | undefined;
}): TRPCMutationOptionsOut<unknown, unknown, unknown, unknown> {
  const { untypedClient, queryClient, path, opts, overrides } = args;

  const mutationKey = getMutationKeyInternal(path);

  const defaultOpts = queryClient.defaultMutationOptions(
    queryClient.getMutationDefaults(mutationKey),
  );

  const mutationSuccessOverride: MutationOptionsOverride['onSuccess'] =
    overrides?.onSuccess ?? ((options) => options.originalFn());

  const mutationFn: MutationFunction = async (input) => {
    const result = await untypedClient.mutation(
      ...getClientArgs([path, { input }], opts),
    );

    return result;
  };

  return {
    ...opts,
    mutationKey: mutationKey,
    mutationFn,
    onSuccess(...args) {
      const originalFn = () =>
        opts?.onSuccess?.(...args) ?? defaultOpts?.onSuccess?.(...args);

      return mutationSuccessOverride({
        originalFn,
        queryClient,
        meta: opts?.meta ?? defaultOpts?.meta ?? {},
      });
    },
    trpc: createTRPCOptionsResult({ path }),
  };
}
