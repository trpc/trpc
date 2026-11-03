import type { CombinedDataTransformer } from '../unstable-core-do-not-import';
import type { DefaultErrorShape, ErrorFormatter } from './error/formatter';
import type { PathSeparator } from './http/pathSeparator';
import type { JSONLProducerOptions } from './stream/jsonl';
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
 * Recommended content types for batch stream responses.
 *
 * `application/json` remains the default for backwards compatibility, while
 * other string values are allowed for tooling or infrastructure compatibility.
 */
export type JSONLContentType =
  | 'application/json'
  | 'application/jsonl'
  | 'application/x-ndjson'
  | (string & {});

export interface JSONLConfig extends Pick<JSONLProducerOptions, 'pingMs'> {
  /**
   * The `content-type` header to use for batch stream responses.
   * Supports any valid content type string.
   * Defaults to `application/json` for backwards compatibility.
   * @default 'application/json'
   */
  contentType?: JSONLContentType;
}

/**
 * The default check to see if we're in a server
 */
export const isServerDefault: boolean =
  typeof window === 'undefined' ||
  'Deno' in window ||
  // oxlint-disable-next-line typescript/dot-notation
  globalThis.process?.env?.['NODE_ENV'] === 'test' ||
  !!globalThis.process?.env?.['JEST_WORKER_ID'] ||
  !!globalThis.process?.env?.['VITEST_WORKER_ID'];

/**
 * The default check to see if we're in development
 */
export function isDevDefault(): boolean {
  // oxlint-disable-next-line typescript/dot-notation
  return globalThis.process?.env['NODE_ENV'] !== 'production';
}

/**
 * The config of a tRPC root object, with the defaults filled in.
 * @see https://trpc.io/docs/server/routers#runtime-configuration
 * @internal
 */
export interface RootConfig<TTypes extends RootTypes> {
  /**
   * The types that are used in the config
   * @internal
   */
  $types: TTypes;
  /**
   * Serializes inputs and outputs, so they can carry types JSON can't.
   * @see https://trpc.io/docs/server/data-transformers
   */
  transformer: CombinedDataTransformer;
  /**
   * Shapes the errors sent to the client.
   * @see https://trpc.io/docs/server/error-formatting
   */
  errorFormatter: ErrorFormatter<TTypes['ctx'], TTypes['errorShape']>;
  /**
   * Lets `@trpc/server` run outside a server, such as in a browser. Meant
   * for tests.
   * @default false
   */
  allowOutsideOfServer: boolean;
  /**
   * Whether this is a server. Meant for tests.
   * @default typeof window === 'undefined' || 'Deno' in window || process.env.NODE_ENV === 'test'
   */
  isServer: boolean;
  /**
   * Whether this is development. Errors include stack traces when it is.
   * @default process.env.NODE_ENV !== 'production'
   */
  isDev: boolean;

  /**
   * The metadata every procedure starts with.
   * @see https://trpc.io/docs/server/metadata#default-meta-chaining-and-shallow-merging
   */
  defaultMeta?: TTypes['meta'] extends object ? TTypes['meta'] : never;

  /**
   * Options for subscriptions over server-sent events (SSE).
   * @see https://trpc.io/docs/client/links/httpSubscriptionLink#sse-options-on-the-server
   */
  sse?: {
    /**
     * Whether subscriptions can be served over SSE.
     * @default true
     */
    enabled?: boolean;
  } & Pick<
    SSEStreamProducerOptions,
    'ping' | 'emitAndEndImmediately' | 'maxDurationMs' | 'client'
  >;

  /**
   * Options for streamed batch responses, which `httpBatchStreamLink`
   * reads.
   * @see https://trpc.io/docs/client/links/httpBatchStreamLink#configure-jsonl-streaming-options
   */
  jsonl?: JSONLConfig;
  /**
   * The character between a procedure path's segments in HTTP URLs, for
   * networks that block `.` in URLs. With `'/'`, `post.byId` is served at
   * `/trpc/post/byId`. Only URLs change: middlewares, errors and query keys
   * still see `post.byId`. The client's HTTP links must use the same
   * separator. Dotted URLs still work.
   * @default '.'
   * @see https://trpc.io/docs/rpc#path-separator
   */
  pathSeparator: PathSeparator;
  /** Experimental options. None right now. */
  experimental?: {};
}

/**
 * The root types: context, metadata, error shape and whether there's a
 * transformer.
 * @internal
 */
export type CreateRootTypes<TGenerics extends RootTypes> = TGenerics;

/** Any root types, for use in generic constraints. */
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
 * Adds a `createContext` option to an adapter's options. It's optional
 * when the context is an empty object.
 */
export type CreateContextCallback<
  TContext,
  TFunction extends (...args: any[]) => any,
> = PartialIf<
  object extends TContext ? true : false,
  {
    /**
     * Creates the context for each request.
     * @see https://trpc.io/docs/server/context#creating-the-context
     **/
    createContext: TFunction;
  }
>;
