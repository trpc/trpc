import type { CombinedDataTransformer } from '../unstable-core-do-not-import';
import type { DefaultErrorShape, ErrorFormatter } from './error/formatter';
import type { SSEStreamProducerOptions } from './stream/sse';

/**
 * The initial generics that are used in the init function
 * @internal
 */
export interface RootTypes {
  ctx: object;
  meta: object;
  errorShape: DefaultErrorShape;
  transformer: boolean;
}

/**
 * The default check to see if we're in a server
 */
export const isServerDefault: boolean =
  typeof window === 'undefined' ||
  'Deno' in window ||
  // eslint-disable-next-line @typescript-eslint/dot-notation
  globalThis.process?.env?.['NODE_ENV'] === 'test' ||
  !!globalThis.process?.env?.['JEST_WORKER_ID'] ||
  !!globalThis.process?.env?.['VITEST_WORKER_ID'];

/**
 * The tRPC root config
 * @internal
 */
export interface RootConfig<TTypes extends RootTypes> {
  /**
   * The types that are used in the config
   * @internal
   */
  $types: TTypes;
  /**
   * Use a data transformer
   * @link https://trpc.io/docs/v11/data-transformers
   */
  transformer: CombinedDataTransformer;
  /**
   * Use custom error formatting
   * @link https://trpc.io/docs/v11/error-formatting
   */
  errorFormatter: ErrorFormatter<TTypes['ctx'], TTypes['errorShape']>;
  /**
   * Allow `@trpc/server` to run in non-server environments
   * @warning **Use with caution**, this should likely mainly be used within testing.
   * @default false
   */
  allowOutsideOfServer: boolean;
  /**
   * Is this a server environment?
   * @warning **Use with caution**, this should likely mainly be used within testing.
   * @default typeof window === 'undefined' || 'Deno' in window || process.env.NODE_ENV === 'test'
   */
  isServer: boolean;
  /**
   * Is this development?
   * Will be used to decide if the API should return stack traces
   * @default process.env.NODE_ENV !== 'production'
   */
  isDev: boolean;

  defaultMeta?: TTypes['meta'] extends object ? TTypes['meta'] : never;

  experimental?: {
    /**
     * Enable support for returning async iterables and returning deferred promises when using `httpBatchStreamLink`
     * @default true
     */
    iterablesAndDeferreds?: boolean;
    /**
     * Enable support for server-sent events (SSE) subscriptions
     */
    sseSubscriptions?: {
      /**
       * Enable server-sent events (SSE) subscriptions
       * @default true
       */
      enabled?: boolean;
    } & Pick<
      SSEStreamProducerOptions,
      'ping' | 'emitAndEndImmediately' | 'maxDurationMs'
    >;
  };
}

/**
 * @internal
 */
export type CreateRootTypes<TGenerics extends RootTypes> = TGenerics;

export type AnyRootTypes = CreateRootTypes<{
  ctx: any;
  meta: any;
  errorShape: any;
  transformer: any;
}>;

type PartialIf<TCondition extends boolean, TType> = TCondition extends true
  ? Partial<TType>
  : TType;

/**
 * Adds a `createContext` option with a given callback function
 * If context is the default value, then the `createContext` option is optional
 */
export type CreateContextCallback<
  TContext,
  TFunction extends (...args: any[]) => any,
> = PartialIf<
  object extends TContext ? true : false,
  {
    /**
     * @link https://trpc.io/docs/v11/context
     **/
    createContext: TFunction;
  }
>;
