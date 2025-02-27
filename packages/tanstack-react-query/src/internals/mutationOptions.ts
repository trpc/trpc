import type {
  MutationFunction,
  QueryClient,
  UseMutationOptions,
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
  unwrapLazyArg,
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
    opts?: TRPCMutationOptionsIn<
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

type AnyTRPCMutationOptionsIn = TRPCMutationOptionsIn<
  unknown,
  unknown,
  unknown,
  unknown
>;

type AnyTRPCMutationOptionsOut = TRPCMutationOptionsOut<
  unknown,
  unknown,
  unknown,
  unknown
>;

/**
 * @internal
 */
export function trpcMutationOptions(args: {
  mutate: typeof TRPCUntypedClient.prototype.mutation;
  queryClient: QueryClient | (() => QueryClient);
  path: readonly string[];
  opts: AnyTRPCMutationOptionsIn;
  overrides: MutationOptionsOverride | undefined;
}): AnyTRPCMutationOptionsOut {
  const { mutate, path, opts, overrides } = args;
  const queryClient = unwrapLazyArg(args.queryClient);

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
