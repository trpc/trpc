import {
  dehydrate,
  HydrationBoundary,
  type QueryClient,
} from '@tanstack/react-query';
import {
  createRecursiveProxy,
  type AnyRouter,
  type inferProcedureInput,
  type RouterRecord,
} from '@trpc/server/unstable-core-do-not-import';
import type {
  AnyProcedure,
  inferProcedureOutput,
  RouterCaller,
  TypeError,
} from '@trpc/server/unstable-core-do-not-import';
import * as React from 'react';
import { getQueryKeyInternal } from './internals/getQueryKey';

type DecorateProcedure<TProcedure extends AnyProcedure> = (
  input: inferProcedureInput<TProcedure>,
) => Promise<inferProcedureOutput<TProcedure>>;

type DecorateRouterRecord<TRecord extends RouterRecord> = {
  [TKey in keyof TRecord]: TRecord[TKey] extends AnyProcedure
    ? DecorateProcedure<TRecord[TKey]>
    : TRecord[TKey] extends RouterRecord
    ? DecorateRouterRecord<TRecord[TKey]>
    : never;
};

type Caller<TRouter extends AnyRouter> = ReturnType<
  RouterCaller<TRouter['_def']['_config']['$types'], TRouter['_def']['record']>
>;

export function createHydrationHelpers<TRouter extends AnyRouter>(
  caller: AnyRouter extends TRouter
    ? TypeError<'Generic parameter missing in `createHydrationHelpers<HERE>`'>
    : Caller<TRouter>,
  getQueryClient: () => QueryClient,
) {
  const wrappedProxy = createRecursiveProxy(async ({ path, args }) => {
    const proc = path.reduce(
      // @ts-expect-error - ??
      (acc, key) => acc[key],
      caller,
    ) as unknown as DecorateProcedure<AnyProcedure>;

    const [input] = args;
    const promise = proc(input);

    void getQueryClient().prefetchQuery({
      queryKey: getQueryKeyInternal(path, input, 'query'),
      queryFn: () => promise,
    });

    return promise;
  }) as DecorateRouterRecord<TRouter['_def']['record']>;

  function HydrateClient(props: { children: React.ReactNode }) {
    const dehydratedState = dehydrate(getQueryClient()); // TODO: transform??

    return (
      <HydrationBoundary state={dehydratedState}>
        {props.children}
      </HydrationBoundary>
    );
  }

  return { trpc: wrappedProxy, HydrateClient };
}
