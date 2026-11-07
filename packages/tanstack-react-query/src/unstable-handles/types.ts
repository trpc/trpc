import type {
  DataTag,
  InfiniteData,
  UseMutationOptions,
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
import type { TRPCMutationKey } from '../shared/mutationKey';
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
 * `useTRPCHandles()` or `createTRPCHandleProxy`
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
 * Options `fromHandle` and `queryOptions` take for a query
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
 * Options `fromHandle` and `queryOptions` return for a query
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
 * Options `fromHandle` and `infiniteQueryOptions` take for an infinite query
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
 * Options `fromHandle` and `infiniteQueryOptions` return for an infinite query
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
 * A query procedure of a handle proxy. Pass it to an entry, read it with
 * `queryOptions`, or use its key to invalidate it.
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
  /**
   * Options for `useQuery`, `useSuspenseQuery`, etc., for a query whose input
   * is only known during render. Read a handle with `fromHandle` instead.
   */
  queryOptions: <TData = TDef['output']>(
    input: TDef['input'],
    opts?: HandleQueryOptionsIn<
      TDef['output'],
      TData,
      ErrorOf<TDef>,
      TDef['keyPrefix']
    >,
  ) => HandleQueryOptionsOut<
    TDef['output'],
    TData,
    ErrorOf<TDef>,
    TDef['keyPrefix']
  >;
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
  /**
   * Options for `useInfiniteQuery`, `useSuspenseInfiniteQuery`, etc., for an
   * infinite query whose input is only known during render
   */
  infiniteQueryOptions: <TData = TDef['output']>(
    input: InfiniteHandleInput<TDef['input']>,
    opts: HandleInfiniteQueryOptionsIn<
      TDef['input'],
      TDef['output'],
      TData,
      ErrorOf<TDef>,
      TDef['keyPrefix']
    >,
  ) => HandleInfiniteQueryOptionsOut<
    TDef['input'],
    TDef['output'],
    TData,
    ErrorOf<TDef>,
    TDef['keyPrefix']
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

/**
 * Options `mutationOptions` takes
 * @internal
 */
export type HandleMutationOptionsIn<TInput, TError, TOutput, TContext> =
  DistributiveOmit<
    UseMutationOptions<TOutput, TError, TInput, TContext>,
    'mutationKey' | 'mutationFn'
  > &
    TRPCQueryBaseOptions;

/**
 * Options `mutationOptions` returns, for `useMutation`
 * @internal
 */
export interface HandleMutationOptionsOut<
  TInput,
  TError,
  TOutput,
  TContext,
  TKeyPrefix extends boolean,
>
  extends
    UseMutationOptions<TOutput, TError, TInput, TContext>,
    TRPCQueryOptionsResult {
  mutationKey: TRPCMutationKey<TKeyPrefix>;
}

/**
 * A mutation procedure of `useTRPCHandles()`
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#standalone-mutations
 */
export interface TRPCHandleMutationProcedure<TDef extends TRPCHandleDef> {
  '~types': {
    input: TDef['input'];
    output: TDef['output'];
    errorShape: TDef['errorShape'];
  };
  /** Options for `useMutation`, the same as `useTRPC()`'s `mutationOptions` */
  mutationOptions: <TContext = unknown>(
    opts?: HandleMutationOptionsIn<
      TDef['input'],
      ErrorOf<TDef>,
      TDef['output'],
      TContext
    >,
  ) => HandleMutationOptionsOut<
    TDef['input'],
    ErrorOf<TDef>,
    TDef['output'],
    TContext,
    TDef['keyPrefix']
  >;
  /** The mutation key, such as for `useIsMutating` or `setMutationDefaults` */
  mutationKey: () => TRPCMutationKey<TDef['keyPrefix']>;
}

type KeptKey<TKey, TValue> = TValue extends AnyTRPCProcedure
  ? TValue['_def']['type'] extends 'query' | 'mutation'
    ? TKey
    : never
  : TKey;

type HandleProcedure<
  TRoot extends AnyTRPCRootTypes,
  TProcedure extends AnyTRPCProcedure,
  TKeyPrefix extends boolean,
> = HandleProcedureOf<
  TProcedure['_def']['type'],
  HandleDefOf<
    inferProcedureInput<TProcedure>,
    inferTransformedProcedureOutput<TRoot, TProcedure>,
    inferProcedureErrorShape<TRoot, TProcedure>,
    TKeyPrefix
  >
>;

type HandleProcedureOf<
  TType,
  TDef extends TRPCHandleDef,
> = TType extends 'mutation'
  ? TRPCHandleMutationProcedure<TDef>
  : TRPCHandleQueryProcedure<TDef> &
      (TDef['input'] extends CursorInput | void
        ? TRPCHandleInfiniteQueryProcedure<TDef>
        : unknown);

/**
 * The queries and mutations of a router, as a handle proxy has them
 * @internal
 */
export type HandleRouterRecord<
  TRoot extends AnyTRPCRootTypes,
  TRecord extends TRPCRouterRecord,
  TKeyPrefix extends boolean,
> = {
  [
    TKey in keyof TRecord as KeptKey<TKey, TRecord[TKey]>
  ]: TRecord[TKey] extends infer $Value
    ? $Value extends TRPCRouterRecord
      ? HandleRouterRecord<TRoot, $Value, TKeyPrefix> &
          TRPCHandleRouter<TKeyPrefix>
      : $Value extends AnyTRPCProcedure
        ? HandleProcedure<TRoot, $Value, TKeyPrefix>
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
 * The proxy from `createTRPCHandleProxy` or `useTRPCHandles()`: the router's
 * queries, for `loadHandles`, the entries and `fromHandle`, their keys, and
 * its mutations
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#standalone
 */
export type TRPCHandleProxy<
  TRouter extends AnyTRPCRouter,
  TFeatureFlags extends TRPCHandleFeatureFlags = { keyPrefix: false },
> = HandleRouterRecord<
  TRouter['_def']['_config']['$types'],
  TRouter['_def']['record'],
  TFeatureFlags['keyPrefix']
> &
  TRPCHandleRouter<TFeatureFlags['keyPrefix']>;
