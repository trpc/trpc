import {
  type QueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';
import type { TRPCClientError, TRPCUntypedClient } from '@trpc/client';
import type {
  AnyMutationProcedure,
  AnyTRPCRouter,
  inferProcedureInput,
  inferTransformedProcedureOutput,
} from '@trpc/server';
import type {
  AnyRootTypes,
  DistributiveOmit,
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

interface UseTRPCMutationOptionsIn<TInput, TError, TOutput, TContext>
  extends DistributiveOmit<
      UseMutationOptions<TOutput, TError, TInput, TContext>,
      ReservedOptions
    >,
    TRPCQueryBaseOptions {}

interface UseTRPCMutationOptionsOut<TInput, TError, TOutput, TContext>
  extends UseMutationOptions<TOutput, TError, TInput, TContext>,
    TRPCQueryOptionsResult {
  mutationKey: TRPCMutationKey;
}

export interface TRPCMutationOptions<
  TRoot extends AnyRootTypes,
  TProcedure extends AnyMutationProcedure,
> {
  <TContext = unknown>(
    opts: UseTRPCMutationOptionsIn<
      inferProcedureInput<TProcedure>,
      TRPCClientError<TRoot>,
      inferTransformedProcedureOutput<TRoot, TProcedure>,
      TContext
    >,
  ): UseTRPCMutationOptionsOut<
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

export const trpcMutationOptions = (args: {
  untypedClient: TRPCUntypedClient<AnyTRPCRouter>;
  queryClient: QueryClient;
  path: readonly string[];
  opts: UseTRPCMutationOptionsIn<unknown, unknown, unknown, unknown>;
  overrides: MutationOptionsOverride | undefined;
}): UseTRPCMutationOptionsOut<unknown, unknown, unknown, unknown> => {
  const { untypedClient, queryClient, path, opts, overrides } = args;

  const mutationKey = getMutationKeyInternal(path);

  const defaultOpts = queryClient.defaultMutationOptions(
    queryClient.getMutationDefaults(mutationKey),
  );

  const mutationSuccessOverride: MutationOptionsOverride['onSuccess'] =
    overrides?.onSuccess ?? ((options) => options.originalFn());

  const options: UseTRPCMutationOptionsOut<unknown, unknown, unknown, unknown> =
    {
      ...opts,
      mutationKey: mutationKey,
      mutationFn: (input) => {
        return untypedClient.mutation(
          ...getClientArgs([path, { input }], opts),
        );
      },
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

  return options;
};
