import type { MutationFunction } from '@tanstack/react-query';
import {
  type QueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';
import type { TRPCClientErrorLike, TRPCUntypedClient } from '@trpc/client';
import type {
  DistributiveOmit,
  MaybePromise,
} from '@trpc/server/unstable-core-do-not-import';
import type {
  ResolverDef,
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

export interface TRPCMutationOptions<TDef extends ResolverDef> {
  <TContext = unknown>(
    opts: TRPCMutationOptionsIn<
      TDef['input'],
      TRPCClientErrorLike<TDef>,
      TDef['output'],
      TContext
    >,
  ): TRPCMutationOptionsOut<
    TDef['input'],
    TRPCClientErrorLike<TDef>,
    TDef['output'],
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
  mutate: typeof TRPCUntypedClient.prototype.mutation;
  queryClient: QueryClient;
  path: readonly string[];
  opts: TRPCMutationOptionsIn<unknown, unknown, unknown, unknown>;
  overrides: MutationOptionsOverride | undefined;
}): TRPCMutationOptionsOut<unknown, unknown, unknown, unknown> {
  const { mutate, queryClient, path, opts, overrides } = args;

  const mutationKey = getMutationKeyInternal(path);

  const defaultOpts = queryClient.defaultMutationOptions(
    queryClient.getMutationDefaults(mutationKey),
  );

  const mutationSuccessOverride: MutationOptionsOverride['onSuccess'] =
    overrides?.onSuccess ?? ((options) => options.originalFn());

  const mutationFn: MutationFunction = async (input) => {
    const result = await mutate(...getClientArgs([path, { input }], opts));

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
