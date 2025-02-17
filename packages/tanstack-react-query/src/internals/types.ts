import type { TRPCRequestOptions } from '@trpc/client';

/**
 * @internal
 */
export type ResolverDef = {
  input: any;
  output: any;
  transformer: boolean;
  errorShape: any;
};

/**
 * @internal
 */
export type ExtractCursorType<TInput> = TInput extends { cursor?: any }
  ? TInput['cursor']
  : unknown;

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
export type TRPCQueryKey = [
  readonly string[],
  { input?: unknown; type?: Exclude<QueryType, 'any'> }?,
];

/**
 * @public
 */
export type TRPCMutationKey = [readonly string[]]; // = [TRPCQueryKey[0]]
