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

/**
 * tRPC options for a single query or mutation, passed as `trpc`.
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
 * Adds the `trpc` option to TanStack Query options.
 * @public
 */
export interface TRPCQueryBaseOptions {
  /**
   * tRPC-related options
   */
  trpc?: TRPCReactRequestOptions;
}

/**
 * Extra fields that tRPC adds to the options it returns.
 * @public
 */
export interface TRPCQueryOptionsResult {
  /**
   * tRPC details about the options, such as the procedure path.
   */
  trpc: {
    /**
     * The dot-separated procedure path, such as `post.byId`.
     */
    path: string;
  };
}

/**
 * The kind of query a key matches. `any` matches both.
 * @public
 */
export type QueryType = 'any' | 'infinite' | 'query';

/**
 * A tRPC query key: the procedure path, then the input and query type.
 * @see https://trpc.io/docs/client/tanstack-react-query/usage#queryKey
 * @public
 */
export type TRPCQueryKeyWithoutPrefix = [
  path: string[],
  opts?: { input?: unknown; type?: Exclude<QueryType, 'any'> },
];

/**
 * A tRPC query key that starts with a key prefix.
 * @see https://trpc.io/docs/client/tanstack-react-query/usage#keyPrefix
 * @public
 */
export type TRPCQueryKeyWithPrefix = [
  prefix: string[],
  ...TRPCQueryKeyWithoutPrefix,
];

/**
 * A tRPC query key, with a prefix if `TPrefixEnabled` is `true`.
 * @see https://trpc.io/docs/client/tanstack-react-query/usage#queryKey
 */
export type TRPCQueryKey<TPrefixEnabled extends boolean = false> =
  TPrefixEnabled extends true
    ? TRPCQueryKeyWithPrefix
    : TRPCQueryKeyWithoutPrefix;

/**
 * Any tRPC query key, with or without a prefix.
 */
export type AnyTRPCQueryKey =
  | TRPCQueryKeyWithoutPrefix
  | TRPCQueryKeyWithPrefix;

/**
 * A tRPC mutation key that starts with a key prefix.
 * @see https://trpc.io/docs/client/tanstack-react-query/usage#keyPrefix
 * @public
 */
export type TRPCMutationKeyWithPrefix = [
  prefix: string[],
  ...TRPCMutationKeyWithoutPrefix,
];

/**
 * A tRPC mutation key: the procedure path.
 * @see https://trpc.io/docs/client/tanstack-react-query/usage#mutationKey
 * @public
 */
export type TRPCMutationKeyWithoutPrefix = [path: string[]];

/**
 * Any tRPC mutation key, with or without a prefix.
 */
export type AnyTRPCMutationKey =
  | TRPCMutationKeyWithoutPrefix
  | TRPCMutationKeyWithPrefix;

/**
 * A tRPC mutation key, with a prefix if `TPrefixEnabled` is `true`.
 * @see https://trpc.io/docs/client/tanstack-react-query/usage#mutationKey
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
  /**
   * Query and mutation keys have no prefix.
   */
  keyPrefix: false;
}>;
