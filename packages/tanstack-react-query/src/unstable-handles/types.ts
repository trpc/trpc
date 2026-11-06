import type {
  DataTag,
  InfiniteData,
  UnusedSkipTokenInfiniteOptions,
  UnusedSkipTokenOptions,
} from '@tanstack/react-query';
import type { TRPCClientErrorLike } from '@trpc/client';
import type {
  AnyTRPCProcedure,
  AnyTRPCRootTypes,
  AnyTRPCRouter,
  inferProcedureErrorShape,
  inferProcedureInput,
  inferTransformedProcedureOutput,
  TRPCRouterRecord,
} from '@trpc/server';
import type {
  coerceAsyncIterableToArray,
  DistributiveOmit,
} from '@trpc/server/unstable-core-do-not-import';
import type {
  TRPCQueryBaseOptions,
  TRPCQueryOptionsResult,
} from '../shared/queryFn';
import type {
  AnyTRPCQueryKey,
  TRPCQueryKey,
  TRPCQueryKeyWithPrefix,
} from '../shared/queryKey';

/**
 * What handles know about a query procedure
 * @internal
 */
export interface TRPCHandleDef {
  input: any;
  output: any;
  errorShape: any;
  keyPrefix: boolean;
}

/**
 * The error a handle's query fails with
 * @internal
 */
export type ErrorOf<TDef extends TRPCHandleDef> = TRPCClientErrorLike<{
  transformer: false;
  errorShape: TDef['errorShape'];
}>;

type ProcedureTypes = { input: any; output: any; errorShape: any };

/**
 * A query procedure of any tRPC proxy: `useTRPC()`, `createTRPCOptionsProxy`,
 * `useTRPCHandles()` or `createTRPCLoaderProxy`
 * @internal
 */
export interface QueryProcedureLike {
  '~types': ProcedureTypes;
  queryKey: (...args: any[]) => AnyTRPCQueryKey;
}

/**
 * An infinite query procedure of any tRPC proxy
 * @internal
 */
export interface InfiniteQueryProcedureLike {
  '~types': ProcedureTypes;
  infiniteQueryKey: (...args: any[]) => AnyTRPCQueryKey;
}

type KeyPrefixOf<TKey> = TKey extends TRPCQueryKeyWithPrefix ? true : false;

/**
 * A {@link TRPCHandleDef} by its parts, so two proxies' procedures give the
 * same handle type
 * @internal
 */
export interface HandleDefOf<
  TInput,
  TOutput,
  TErrorShape,
  TKeyPrefix extends boolean,
> extends TRPCHandleDef {
  input: TInput;
  output: TOutput;
  errorShape: TErrorShape;
  keyPrefix: TKeyPrefix;
}

/**
 * @internal
 */
export type DefOf<TProcedure extends QueryProcedureLike> = HandleDefOf<
  TProcedure['~types']['input'],
  TProcedure['~types']['output'],
  TProcedure['~types']['errorShape'],
  KeyPrefixOf<ReturnType<TProcedure['queryKey']>>
>;

/**
 * @internal
 */
export type InfiniteDefOf<TProcedure extends InfiniteQueryProcedureLike> =
  HandleDefOf<
    TProcedure['~types']['input'],
    TProcedure['~types']['output'],
    TProcedure['~types']['errorShape'],
    KeyPrefixOf<ReturnType<TProcedure['infiniteQueryKey']>>
  >;

type CursorInput = { cursor?: any };

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
 * @internal
 */
export type InfiniteHandleInput<TInput> = TInput extends object
  ? Omit<TInput, 'cursor' | 'direction'>
  : TInput;

type ReservedOptions = 'queryKey' | 'queryFn' | 'queryHashFn' | 'queryHash';

/**
 * Options `fromHandle` takes for a query handle
 * @internal
 */
export interface HandleQueryOptionsIn<
  TQueryFnData,
  TData,
  TError,
  TKeyPrefix extends boolean,
>
  extends
    DistributiveOmit<
      UnusedSkipTokenOptions<
        coerceAsyncIterableToArray<TQueryFnData>,
        TError,
        coerceAsyncIterableToArray<TData>,
        TRPCQueryKey<TKeyPrefix>
      >,
      ReservedOptions
    >,
    TRPCQueryBaseOptions {}

/**
 * Options `fromHandle` returns for a query handle
 * @internal
 */
export interface HandleQueryOptionsOut<
  TQueryFnData,
  TData,
  TError,
  TKeyPrefix extends boolean,
>
  extends
    UnusedSkipTokenOptions<
      coerceAsyncIterableToArray<TQueryFnData>,
      TError,
      coerceAsyncIterableToArray<TData>,
      TRPCQueryKey<TKeyPrefix>
    >,
    TRPCQueryOptionsResult {
  queryKey: DataTag<
    TRPCQueryKey<TKeyPrefix>,
    coerceAsyncIterableToArray<TData>,
    TError
  >;
}

/**
 * Options `fromHandle` takes for an infinite query handle
 * @internal
 */
export interface HandleInfiniteQueryOptionsIn<
  TInput,
  TQueryFnData,
  TData,
  TError,
  TKeyPrefix extends boolean,
>
  extends
    DistributiveOmit<
      UnusedSkipTokenInfiniteOptions<
        TQueryFnData,
        TError,
        TRPCInfiniteData<TInput, TData>,
        TRPCQueryKey<TKeyPrefix>,
        NonNullable<ExtractCursorType<TInput>> | null
      >,
      ReservedOptions | 'initialPageParam'
    >,
    TRPCQueryBaseOptions {
  initialCursor?: NonNullable<ExtractCursorType<TInput>> | null;
}

/**
 * Options `fromHandle` returns for an infinite query handle
 * @internal
 */
export interface HandleInfiniteQueryOptionsOut<
  TInput,
  TQueryFnData,
  TData,
  TError,
  TKeyPrefix extends boolean,
>
  extends
    DistributiveOmit<
      UnusedSkipTokenInfiniteOptions<
        TQueryFnData,
        TError,
        TRPCInfiniteData<TInput, TData>,
        TRPCQueryKey<TKeyPrefix>,
        NonNullable<ExtractCursorType<TInput>> | null
      >,
      'initialPageParam'
    >,
    TRPCQueryOptionsResult {
  queryKey: DataTag<
    TRPCQueryKey<TKeyPrefix>,
    TRPCInfiniteData<TInput, TData>,
    TError
  >;
  initialPageParam: NonNullable<ExtractCursorType<TInput>> | null;
}

/**
 * A query procedure of a handle proxy. Pass it to the handle functions, or
 * read its key to invalidate it.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#standalone
 */
export interface TRPCHandleQueryProcedure<TDef extends TRPCHandleDef> {
  '~types': {
    input: TDef['input'];
    output: TDef['output'];
    errorShape: TDef['errorShape'];
  };
  /**
   * The query key for an input, such as for `queryClient.invalidateQueries`.
   * Without an input, it matches the procedure's queries for every input.
   */
  queryKey: (
    input?: TDef['input'],
  ) => DataTag<TRPCQueryKey<TDef['keyPrefix']>, TDef['output'], ErrorOf<TDef>>;
}

/**
 * An infinite query procedure of a handle proxy
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#standalone
 */
export interface TRPCHandleInfiniteQueryProcedure<TDef extends TRPCHandleDef> {
  '~types': {
    input: TDef['input'];
    output: TDef['output'];
    errorShape: TDef['errorShape'];
  };
  /** The infinite query key for an input, such as for `queryClient.invalidateQueries` */
  infiniteQueryKey: (
    input?: InfiniteHandleInput<TDef['input']>,
  ) => DataTag<
    TRPCQueryKey<TDef['keyPrefix']>,
    TRPCInfiniteData<TDef['input'], TDef['output']>,
    ErrorOf<TDef>
  >;
}

/**
 * A router of a handle proxy, or its root
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#standalone
 */
export interface TRPCHandleRouter<TKeyPrefix extends boolean> {
  /** The key that matches every query in this router, such as for `queryClient.invalidateQueries` */
  pathKey: () => TRPCQueryKey<TKeyPrefix>;
}

type QueryKeyOf<TKey, TValue> = TValue extends AnyTRPCProcedure
  ? TValue['_def']['type'] extends 'query'
    ? TKey
    : never
  : TKey;

type HandleProcedure<
  TRoot extends AnyTRPCRootTypes,
  TProcedure extends AnyTRPCProcedure,
  TKeyPrefix extends boolean,
  TBrand,
> = HandleProcedureOf<
  HandleDefOf<
    inferProcedureInput<TProcedure>,
    inferTransformedProcedureOutput<TRoot, TProcedure>,
    inferProcedureErrorShape<TRoot, TProcedure>,
    TKeyPrefix
  >,
  TBrand
>;

type HandleProcedureOf<
  TDef extends TRPCHandleDef,
  TBrand,
> = TRPCHandleQueryProcedure<TDef> &
  TBrand &
  (TDef['input'] extends CursorInput | void
    ? TRPCHandleInfiniteQueryProcedure<TDef>
    : unknown);

/**
 * The queries of a router, as a handle proxy has them
 * @internal
 */
export type HandleRouterRecord<
  TRoot extends AnyTRPCRootTypes,
  TRecord extends TRPCRouterRecord,
  TKeyPrefix extends boolean,
  TBrand,
> = {
  [
    TKey in keyof TRecord as QueryKeyOf<TKey, TRecord[TKey]>
  ]: TRecord[TKey] extends infer $Value
    ? $Value extends TRPCRouterRecord
      ? HandleRouterRecord<TRoot, $Value, TKeyPrefix, TBrand> &
          TRPCHandleRouter<TKeyPrefix>
      : $Value extends AnyTRPCProcedure
        ? HandleProcedure<TRoot, $Value, TKeyPrefix, TBrand>
        : never
    : never;
};

/**
 * Whether query keys start with a prefix
 * @see https://trpc.io/docs/client/tanstack-react-query/usage#keyPrefix
 */
export interface TRPCHandleFeatureFlags {
  keyPrefix: boolean;
}

/**
 * The proxy from `useTRPCHandles()`: the router's queries, for
 * `fromHandle` and `waterfallHandle`, and their keys
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#standalone
 */
export type TRPCHandleProxy<
  TRouter extends AnyTRPCRouter,
  TFeatureFlags extends TRPCHandleFeatureFlags = { keyPrefix: false },
> = HandleRouterRecord<
  TRouter['_def']['_config']['$types'],
  TRouter['_def']['record'],
  TFeatureFlags['keyPrefix'],
  unknown
> &
  TRPCHandleRouter<TFeatureFlags['keyPrefix']>;

declare const loaderBrand: unique symbol;

/**
 * Type-only: marks the root of a {@link TRPCLoaderProxy}, which
 * `loadHandles` takes, and its query procedures, which the entries take.
 * Other proxies don't have it, since a render can't wait for queries.
 * @internal
 */
export interface TRPCLoaderBrand<TLevel extends 'root' | 'procedure'> {
  readonly [loaderBrand]: TLevel;
}

/**
 * The proxy from `createTRPCLoaderProxy`: like {@link TRPCHandleProxy}, and it
 * can load handles, in a route loader or a server component
 * @see https://trpc.io/docs/client/tanstack-react-query/handles
 */
export type TRPCLoaderProxy<
  TRouter extends AnyTRPCRouter,
  TFeatureFlags extends TRPCHandleFeatureFlags = { keyPrefix: false },
> = HandleRouterRecord<
  TRouter['_def']['_config']['$types'],
  TRouter['_def']['record'],
  TFeatureFlags['keyPrefix'],
  TRPCLoaderBrand<'procedure'>
> &
  TRPCHandleRouter<TFeatureFlags['keyPrefix']> &
  TRPCLoaderBrand<'root'>;
