import type { InfiniteData } from '@tanstack/react-query';

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
  featureFlags: FeatureFlags;
};

/**
 * @remark `void` is here due to https://github.com/trpc/trpc/pull/4374
 */
type CursorInput = { cursor?: any };
/**
 * An input that may have a `cursor`, as used by infinite queries.
 */
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

export type {
  AnyTRPCQueryKey,
  QueryType,
  TRPCQueryKey,
  TRPCQueryKeyWithoutPrefix,
  TRPCQueryKeyWithPrefix,
} from '../shared/queryKey';
export type {
  TRPCQueryBaseOptions,
  TRPCQueryOptionsResult,
  TRPCReactRequestOptions,
} from '../shared/queryFn';

export type {
  AnyTRPCMutationKey,
  TRPCMutationKey,
  TRPCMutationKeyWithoutPrefix,
  TRPCMutationKeyWithPrefix,
} from '../shared/mutationKey';

/**
 * Feature flags for configuring tRPC behavior
 * @public
 */
export type FeatureFlags = {
  /**
   * Whether query and mutation keys start with a prefix.
   * @see https://trpc.io/docs/client/tanstack-react-query/usage#keyPrefix
   */
  keyPrefix: boolean;
};

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
    : {
        /**
         * In order to use a query key prefix, you have to initialize the context with the `keyPrefix`
         */
        keyPrefix?: never;
      };
/**
 * Default feature flags with query key prefix disabled
 * @public
 */
export type DefaultFeatureFlags = ofFeatureFlags<{
  /**
   * Query and mutation keys have no prefix.
   */
  keyPrefix: false;
}>;
