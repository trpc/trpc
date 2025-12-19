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
  DefaultFeatureFlags,
  FeatureFlags,
  KeyPrefixOptions,
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

type TRPCMutationOptionsIn<
  TInput,
  TError,
  TOutput,
  TContext,
  TFeatureFlags extends FeatureFlags,
> = DistributiveOmit<
  UseMutationOptions<TOutput, TError, TInput, TContext>,
  ReservedOptions
> &
  TRPCQueryBaseOptions &
  KeyPrefixOptions<TFeatureFlags>;

interface TRPCMutationOptionsOut<
  TInput,
  TError,
  TOutput,
  TContext,
  TFeatureFlags extends FeatureFlags,
> extends UseMutationOptions<TOutput, TError, TInput, TContext>,
    TRPCQueryOptionsResult {
  mutationKey: TRPCMutationKey<TFeatureFlags['keyPrefix']>;
}

export interface TRPCMutationOptions<
  TDef extends ResolverDef,
  TFeatureFlags extends FeatureFlags = DefaultFeatureFlags,
> {
  <TContext = unknown>(
    opts?: TRPCMutationOptionsIn<
      TDef['input'],
      TRPCClientErrorLike<TDef>,
      TDef['output'],
      TContext,
      TFeatureFlags
    >,
  ): TRPCMutationOptionsOut<
    TDef['input'],
    TRPCClientErrorLike<TDef>,
    TDef['output'],
    TContext,
    TFeatureFlags
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
    originalFn: () => MaybePromise<void>;
    queryClient: QueryClient;
    /**
     * Meta data passed in from the `useMutation()` hook
     */
    meta: Record<string, unknown>;
  }) => MaybePromise<void>;
}

type AnyTRPCMutationOptionsIn<TFeatureFlags extends FeatureFlags> =
  TRPCMutationOptionsIn<unknown, unknown, unknown, unknown, TFeatureFlags>;

type AnyTRPCMutationOptionsOut<TFeatureFlags extends FeatureFlags> =
  TRPCMutationOptionsOut<unknown, unknown, unknown, unknown, TFeatureFlags>;

/**
 * @internal
 */
export function trpcMutationOptions<TFeatureFlags extends FeatureFlags>(args: {
  mutate: typeof TRPCUntypedClient.prototype.mutation;
  queryClient: QueryClient | (() => QueryClient);
  path: string[];
  opts: AnyTRPCMutationOptionsIn<TFeatureFlags> | undefined;
  overrides: MutationOptionsOverride | undefined;
}): AnyTRPCMutationOptionsOut<TFeatureFlags> {
  const { mutate, path, opts, overrides } = args;
  const queryClient = unwrapLazyArg(args.queryClient);

  const mutationKey = getMutationKeyInternal({
    path,
    prefix: opts?.keyPrefix,
  }) as TRPCMutationKey<TFeatureFlags['keyPrefix']>;

  const defaultOpts = queryClient.defaultMutationOptions(
    queryClient.getMutationDefaults(mutationKey),
  );

  const mutationSuccessOverride: MutationOptionsOverride['onSuccess'] =
    overrides?.onSuccess ?? ((options) => options.originalFn());

  const mutationFn: MutationFunction = async (input) => {
    const result = await mutate(
      ...getClientArgs([...mutationKey, { input }] as any, opts),
    );

    return result;
  };

  return {
    ...opts,
    mutationKey,
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
