import type { InfiniteData } from '@tanstack/react-query';
import type { TRPCRequestOptions } from '@trpc/client';

/**
 * Turn a set of optional properties into required
 * @internal
 */
export type WithRequired<TObj, TKey extends keyof TObj> = TObj & {
  [P in TKey]-?: TObj[P];
};

/**
 * @internal
 */
export type ResolverDef = {
  input: any;
  output: any;
  transformer: boolean;
  errorShape: any;
  /**
   * Only set when query keys are typed with a prefix
   */
  featureFlags?: FeatureFlags;
};

/**
 * @internal
 */
export type inferFeatureFlags<TDef extends ResolverDef> = TDef extends {
  featureFlags: infer $FeatureFlags extends FeatureFlags;
}
  ? $FeatureFlags
  : DefaultFeatureFlags;

/**
 * @remark `void` is here due to https://github.com/trpc/trpc/pull/4374
 */
type CursorInput = { cursor?: any };
export type OptionalCursorInput = CursorInput | void;

/**
 * @internal
 */
export type ExtractCursorType<TInput> = TInput extends CursorInput
  ? TInput['cursor']
  : unknown;

/**
 * @internal
 */
export type TRPCInfiniteData<TInput, TOutput> = InfiniteData<
  TOutput,
  NonNullable<ExtractCursorType<TInput>> | null
>;

/**
 * @public
 */
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

/**
 * @public
 */
export interface TRPCQueryBaseOptions {
  /**
   * tRPC-related options
   */
  trpc?: TRPCReactRequestOptions;
}

/**
 * @public
 */
export interface TRPCQueryOptionsResult {
  trpc: {
    path: string;
  };
}

/**
 * @public
 */
export type QueryType = 'any' | 'infinite' | 'query';

/**
 * @public
 */
export type TRPCQueryKeyWithoutPrefix = [
  path: string[],
  opts?: { input?: unknown; type?: Exclude<QueryType, 'any'> },
];

/**
 * @public
 */
export type TRPCQueryKeyWithPrefix = [
  prefix: string[],
  ...TRPCQueryKeyWithoutPrefix,
];

export type TRPCQueryKey<TPrefixEnabled extends boolean = false> =
  TPrefixEnabled extends true
    ? TRPCQueryKeyWithPrefix
    : TRPCQueryKeyWithoutPrefix;

export type AnyTRPCQueryKey =
  TRPCQueryKeyWithoutPrefix | TRPCQueryKeyWithPrefix;

/**
 * @public
 */
export type TRPCMutationKeyWithPrefix = [
  prefix: string[],
  ...TRPCMutationKeyWithoutPrefix,
];

/**
 * @public
 */
export type TRPCMutationKeyWithoutPrefix = [path: string[]];

export type AnyTRPCMutationKey =
  TRPCMutationKeyWithoutPrefix | TRPCMutationKeyWithPrefix;

/**
 * @public
 */
export type TRPCMutationKey<TPrefixEnabled extends boolean = false> =
  TPrefixEnabled extends true
    ? TRPCMutationKeyWithPrefix
    : TRPCMutationKeyWithoutPrefix;

/**
 * Type-level options for query and mutation keys.
 *
 * `keyPrefix: true` types keys with a prefix, `false` without one, and
 * `boolean` as either.
 * @public
 */
export type FeatureFlags = { keyPrefix: boolean };

/**
 * @internal
 */
export type ofFeatureFlags<T extends FeatureFlags> = T;

/**
 * @internal
 */
export type KeyPrefixOptions<TFeatureFlags extends FeatureFlags> =
  TFeatureFlags['keyPrefix'] extends true
    ? {
        keyPrefix: string;
      }
    : TFeatureFlags['keyPrefix'] extends false
      ? {
          /**
           * In order to use a query key prefix, you have to initialize the context with the `keyPrefix`
           */
          keyPrefix?: never;
        }
      : {
          keyPrefix?: string | undefined;
        };
/**
 * Default feature flags with query key prefix disabled
 * @public
 */
export type DefaultFeatureFlags = ofFeatureFlags<{
  keyPrefix: false;
}>;
