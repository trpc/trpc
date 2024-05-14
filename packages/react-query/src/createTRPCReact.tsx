import type { SkipToken } from '@tanstack/react-query';
import type { TRPCClientErrorLike } from '@trpc/client';
import type {
  AnyProcedure,
  AnyRootTypes,
  AnyRouter,
  inferProcedureInput,
  inferTransformedProcedureOutput,
  ProcedureType,
  ProtectedIntersection,
  RouterRecord,
} from '@trpc/server/unstable-core-do-not-import';
import { createFlatProxy } from '@trpc/server/unstable-core-do-not-import';
import * as React from 'react';
import type {
  TRPCUseQueries,
  TRPCUseSuspenseQueries,
} from './internals/useQueries';
import type { CreateReactUtils } from './shared';
import { createReactDecoration, createReactQueryUtils } from './shared';
import type { CreateReactQueryHooks } from './shared/hooks/createHooksInternal';
import { createRootHooks } from './shared/hooks/createHooksInternal';
import type {
  CreateClient,
  DefinedUseTRPCQueryOptions,
  DefinedUseTRPCQueryResult,
  TRPCProvider,
  UseTRPCInfiniteQueryOptions,
  UseTRPCInfiniteQueryResult,
  UseTRPCMutationOptions,
  UseTRPCMutationResult,
  UseTRPCQueryOptions,
  UseTRPCQueryResult,
  UseTRPCSubscriptionOptions,
  UseTRPCSuspenseInfiniteQueryOptions,
  UseTRPCSuspenseInfiniteQueryResult,
  UseTRPCSuspenseQueryOptions,
  UseTRPCSuspenseQueryResult,
} from './shared/hooks/types';
import type { CreateTRPCReactOptions } from './shared/types';

type ResolverDef = {
  input: any;
  output: any;
  transformer: boolean;
  errorShape: any;
};
/**
 * @internal
 */
export interface ProcedureUseQuery<TDef extends ResolverDef> {
  <TQueryFnData extends TDef['output'] = TDef['output'], TData = TQueryFnData>(
    input: TDef['input'] | SkipToken,
    opts: DefinedUseTRPCQueryOptions<
      TQueryFnData,
      TData,
      TRPCClientErrorLike<{
        errorShape: TDef['errorShape'];
        transformer: TDef['transformer'];
      }>,
      TDef['output']
    >,
  ): DefinedUseTRPCQueryResult<
    TData,
    TRPCClientErrorLike<{
      errorShape: TDef['errorShape'];
      transformer: TDef['transformer'];
    }>
  >;

  <TQueryFnData extends TDef['output'] = TDef['output'], TData = TQueryFnData>(
    input: TDef['input'] | SkipToken,
    opts?: UseTRPCQueryOptions<
      TQueryFnData,
      TData,
      TRPCClientErrorLike<TDef>,
      TDef['output']
    >,
  ): UseTRPCQueryResult<TData, TRPCClientErrorLike<TDef>>;
}

/**
 * @remark `void` is here due to https://github.com/trpc/trpc/pull/4374
 */
type CursorInput = {
  cursor?: any;
} | void;

type ReservedInfiniteQueryKeys = 'cursor' | 'direction';
/**
 * @internal
 */
export type MaybeDecoratedInfiniteQuery<TDef extends ResolverDef> =
  TDef['input'] extends CursorInput
    ? {
        /**
         * @link https://trpc.io/docs/v11/client/react/suspense#useinfinitesuspensequery
         */
        useInfiniteQuery: (
          input: Omit<TDef['input'], ReservedInfiniteQueryKeys> | SkipToken,
          opts: UseTRPCInfiniteQueryOptions<
            TDef['input'],
            TDef['output'],
            TRPCClientErrorLike<TDef>
          >,
        ) => UseTRPCInfiniteQueryResult<
          TDef['output'],
          TRPCClientErrorLike<TDef>,
          TDef['input']
        >;
        /**
         * @link https://trpc.io/docs/v11/client/react/suspense
         */
        useSuspenseInfiniteQuery: (
          input: Omit<TDef['input'], 'cursor' | 'direction'>,
          opts: UseTRPCSuspenseInfiniteQueryOptions<
            TDef['input'],
            TDef['output'],
            TRPCClientErrorLike<TDef>
          >,
        ) => UseTRPCSuspenseInfiniteQueryResult<
          TDef['output'],
          TRPCClientErrorLike<TDef>,
          TDef['input']
        >;
      }
    : object;

/**
 * @internal
 */
export type DecoratedQueryMethods<TDef extends ResolverDef> = {
  /**
   * @link https://trpc.io/docs/v11/client/react/useQuery
   */
  useQuery: ProcedureUseQuery<TDef>;
  /**
   * @link https://trpc.io/docs/v11/client/react/suspense#usesuspensequery
   */
  useSuspenseQuery: <
    TQueryFnData extends TDef['output'] = TDef['output'],
    TData = TQueryFnData,
  >(
    input: TDef['input'],
    opts?: UseTRPCSuspenseQueryOptions<
      TQueryFnData,
      TData,
      TRPCClientErrorLike<TDef>
    >,
  ) => UseTRPCSuspenseQueryResult<TData, TRPCClientErrorLike<TDef>>;
};

/**
 * @internal
 */
export type DecoratedQuery<TDef extends ResolverDef> =
  MaybeDecoratedInfiniteQuery<TDef> & DecoratedQueryMethods<TDef>;

export type DecoratedMutation<TDef extends ResolverDef> = {
  /**
   * @link https://trpc.io/docs/v11/client/react/useMutation
   */
  useMutation: <TContext = unknown>(
    opts?: UseTRPCMutationOptions<
      TDef['input'],
      TRPCClientErrorLike<TDef>,
      TDef['output'],
      TContext
    >,
  ) => UseTRPCMutationResult<
    TDef['output'],
    TRPCClientErrorLike<TDef>,
    TDef['input'],
    TContext
  >;
};
/**
 * @internal
 */
export type DecorateProcedure<
  TType extends ProcedureType,
  TDef extends ResolverDef,
> = TType extends 'query'
  ? DecoratedQuery<TDef>
  : TType extends 'mutation'
  ? DecoratedMutation<TDef>
  : TType extends 'subscription'
  ? {
      /**
       * @link https://trpc.io/docs/v11/subscriptions
       */
      useSubscription: (
        input: TDef['input'],
        opts?: UseTRPCSubscriptionOptions<
          TDef['output'],
          TRPCClientErrorLike<TDef>
        >,
      ) => void;
    }
  : never;

/**
 * @internal
 */
export type DecorateRouterRecord<
  TRoot extends AnyRootTypes,
  TRecord extends RouterRecord,
> = {
  [TKey in keyof TRecord]: TRecord[TKey] extends infer $Value
    ? $Value extends RouterRecord
      ? DecorateRouterRecord<TRoot, $Value>
      : $Value extends AnyProcedure
      ? DecorateProcedure<
          $Value['_def']['type'],
          {
            input: inferProcedureInput<$Value>;
            output: inferTransformedProcedureOutput<TRoot, $Value>;
            transformer: TRoot['transformer'];
            errorShape: TRoot['errorShape'];
          }
        >
      : never
    : never;
};

/**
 * @internal
 */
export type CreateTRPCReactBase<TRouter extends AnyRouter, TSSRContext> = {
  /**
   * @deprecated renamed to `useUtils` and will be removed in a future tRPC version
   *
   * @link https://trpc.io/docs/v11/client/react/useUtils
   */
  useContext(): CreateReactUtils<TRouter, TSSRContext>;
  /**
   * @link https://trpc.io/docs/v11/client/react/useUtils
   */
  useUtils(): CreateReactUtils<TRouter, TSSRContext>;
  Provider: TRPCProvider<TRouter, TSSRContext>;
  createClient: CreateClient<TRouter>;
  useQueries: TRPCUseQueries<TRouter>;
  useSuspenseQueries: TRPCUseSuspenseQueries<TRouter>;
};

export type CreateTRPCReact<
  TRouter extends AnyRouter,
  TSSRContext,
> = ProtectedIntersection<
  CreateTRPCReactBase<TRouter, TSSRContext>,
  DecorateRouterRecord<
    TRouter['_def']['_config']['$types'],
    TRouter['_def']['record']
  >
>;

/**
 * @internal
 */
export function createHooksInternal<
  TRouter extends AnyRouter,
  TSSRContext = unknown,
>(trpc: CreateReactQueryHooks<TRouter, TSSRContext>) {
  type CreateHooksInternal = CreateTRPCReact<TRouter, TSSRContext>;

  return createFlatProxy<CreateHooksInternal>((key) => {
    if (key === 'useContext' || key === 'useUtils') {
      return () => {
        const context = trpc.useUtils();
        // create a stable reference of the utils context
        return React.useMemo(() => {
          return (createReactQueryUtils as any)(context);
        }, [context]);
      };
    }

    if (trpc.hasOwnProperty(key)) {
      return (trpc as any)[key];
    }

    return createReactDecoration(key, trpc);
  });
}

export function createTRPCReact<
  TRouter extends AnyRouter,
  TSSRContext = unknown,
>(
  opts?: CreateTRPCReactOptions<TRouter>,
): CreateTRPCReact<TRouter, TSSRContext> {
  const hooks = createRootHooks<TRouter, TSSRContext>(opts);
  const proxy = createHooksInternal<TRouter, TSSRContext>(hooks);

  return proxy as any;
}
