/// <reference types="react/canary" />

import {
  dehydrate,
  HydrationBoundary,
  type QueryClient,
} from '@tanstack/react-query';
import type { TRPCClientError } from '@trpc/client';
import type { inferTransformedProcedureOutput } from '@trpc/server';
import {
  createRecursiveProxy,
  type AnyRouter,
  type inferProcedureInput,
  type RouterRecord,
} from '@trpc/server/unstable-core-do-not-import';
import type {
  AnyProcedure,
  AnyRootTypes,
  inferProcedureOutput,
  inferRouterRootTypes,
  Maybe,
  RouterCaller,
  TypeError,
} from '@trpc/server/unstable-core-do-not-import';
import * as React from 'react';
import { getQueryKeyInternal } from './internals/getQueryKey';
import type {
  TRPCFetchInfiniteQueryOptions,
  TRPCFetchQueryOptions,
} from './shared';

const HELPERS = ['prefetch', 'prefetchInfinite'];

type DecorateProcedure<
  TRoot extends AnyRootTypes,
  TProcedure extends AnyProcedure,
> = {
  (
    input: inferProcedureInput<TProcedure>,
  ): Promise<inferProcedureOutput<TProcedure>>;
  prefetch: (
    input: inferProcedureInput<TProcedure>,
    opts?: TRPCFetchQueryOptions<
      inferTransformedProcedureOutput<TRoot, TProcedure>,
      TRPCClientError<TRoot>
    >,
  ) => Promise<void>;
  prefetchInfinite: (
    input: inferProcedureInput<TProcedure>,
    opts?: TRPCFetchInfiniteQueryOptions<
      inferProcedureInput<TProcedure>,
      inferTransformedProcedureOutput<TRoot, TProcedure>,
      TRPCClientError<TRoot>
    >,
  ) => Promise<void>;
};

type DecorateRouterRecord<
  TRoot extends AnyRootTypes,
  TRecord extends RouterRecord,
> = {
  [TKey in keyof TRecord]: TRecord[TKey] extends infer $Value
    ? $Value extends AnyProcedure
      ? DecorateProcedure<TRoot, $Value>
      : $Value extends RouterRecord
        ? DecorateRouterRecord<TRoot, $Value>
        : never
    : never;
};

type Caller<TRouter extends AnyRouter> = ReturnType<
  RouterCaller<inferRouterRootTypes<TRouter>, TRouter['_def']['record']>
>;

// ts-prune-ignore-next
/**
 * @note This requires `@tanstack/react-query@^5.49.0`
 * @note Make sure to have `dehydrate.serializeData` and `hydrate.deserializeData`
 * set to your data transformer in your `QueryClient` factory.
 * @example
 * ```ts
 * export const createQueryClient = () =>
 *   new QueryClient({
 *     defaultOptions: {
 *       dehydrate: {
 *         serializeData: transformer.serialize,
 *       },
 *       hydrate: {
 *         deserializeData: transformer.deserialize,
 *       },
 *     },
 *   });
 * ```
 */
export function createHydrationHelpers<TRouter extends AnyRouter>(
  caller: AnyRouter extends TRouter
    ? TypeError<'Generic parameter missing in `createHydrationHelpers<HERE>`'>
    : Caller<TRouter>,
  getQueryClient: () => QueryClient,
) {
  type RootTypes = inferRouterRootTypes<TRouter>;

  const wrappedProxy = createRecursiveProxy<
    DecorateRouterRecord<RootTypes, TRouter['_def']['record']>
  >(async (opts) => {
    const path = [...opts.path];
    const args = [...opts.args];
    const proc = path.reduce(
      (acc, key) =>
        // @ts-expect-error - ??
        HELPERS.includes(key) ? acc : acc[key],
      caller,
    ) as unknown as DecorateProcedure<RootTypes, AnyProcedure>;

    const input = args[0];
    const promise = proc(input);

    const helper = path.pop();
    if (helper === 'prefetch') {
      const args1 = args[1] as Maybe<
        TRPCFetchInfiniteQueryOptions<any, any, any>
      >;

      return getQueryClient().prefetchQuery({
        ...args1,
        queryKey: getQueryKeyInternal(path, input, 'query'),
        queryFn: () => promise,
      });
    }
    if (helper === 'prefetchInfinite') {
      const args1 = args[1] as Maybe<
        TRPCFetchInfiniteQueryOptions<any, any, any>
      >;

      return getQueryClient().prefetchInfiniteQuery({
        ...args1,
        queryKey: getQueryKeyInternal(path, input, 'infinite'),
        queryFn: () => promise,
        initialPageParam: args1?.initialCursor ?? null,
      });
    }

    return promise;
  });

  function HydrateClient(props: { children: React.ReactNode }) {
    const dehydratedState = dehydrate(getQueryClient());

    return (
      <HydrationBoundary state={dehydratedState}>
        {props.children}
      </HydrationBoundary>
    );
  }

  return {
    /***
     * Wrapped caller with prefetch helpers
     * Can be used as a regular [server-side caller](https://trpc.io/docs/server/server-side-calls)
     * or using prefetch helpers to put the promise into the QueryClient cache
     * @example
     * ```ts
     * const data = await trpc.post.get("postId");
     *
     * // or
     * void trpc.post.get.prefetch("postId");
     * ```
     */
    trpc: wrappedProxy,
    /**
     * HoC to hydrate the query client for a client component
     * to pick up the prefetched promise and skip an initial
     * client-side fetch.
     * @example
     * ```tsx
     * // MyRSC.tsx
     * const MyRSC = ({ params }) => {
     *   void trpc.post.get.prefetch(params.postId);
     *
     *   return (
     *     <HydrateClient>
     *       <MyCC postId={params.postId} />
     *     </HydrateClient>
     *    );
     * };
     *
     * // MyCC.tsx
     * "use client"
     * const MyCC = ({ postId }) => {
     *   const { data: post } = trpc.post.get.useQuery(postId);
     *   return <div>{post.title}</div>;
     * };
     * ```
     */
    HydrateClient,
  };
}
