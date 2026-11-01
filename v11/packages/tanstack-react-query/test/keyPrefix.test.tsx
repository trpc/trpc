import { QueryClient } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import {
  createTRPCContext,
  createTRPCOptionsProxy,
  type AnyTRPCQueryKey,
  type DecorateQueryProcedure,
  type TRPCMutationKeyWithoutPrefix,
  type TRPCMutationKeyWithPrefix,
  type TRPCQueryKeyWithoutPrefix,
  type TRPCQueryKeyWithPrefix,
  type TRPCQueryOptions,
} from '@trpc/tanstack-react-query';
import * as React from 'react';
import { expect, expectTypeOf, test } from 'vitest';
import { z } from 'zod';

const t = initTRPC.create();
const appRouter = t.router({
  q: t.procedure.query(() => 'query' as const),
  list: t.procedure
    .input(z.object({ cursor: z.number().nullish() }))
    .query(() => ['item']),
  m: t.procedure.mutation(() => 'mutation' as const),
});
type AppRouter = typeof appRouter;

const createClient = () =>
  createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: 'http://localhost:3000' })],
  });

test('createTRPCOptionsProxy: the router type comes from the client and key types from keyPrefix', () => {
  const trpc = createTRPCOptionsProxy({
    client: createClient(),
    queryClient: new QueryClient(),
    keyPrefix: 'billing',
  });

  const pathKey = trpc.q.pathKey();
  expectTypeOf(pathKey).toEqualTypeOf<TRPCQueryKeyWithPrefix>();
  expect(pathKey).toEqual([['billing'], ['q']]);

  const queryKey = trpc.q.queryKey();
  expectTypeOf(queryKey[2]).toEqualTypeOf<TRPCQueryKeyWithPrefix[2]>();
  expect(queryKey).toEqual([['billing'], ['q'], { type: 'query' }]);

  const infiniteQueryKey = trpc.list.infiniteQueryKey();
  expectTypeOf(infiniteQueryKey[2]).toEqualTypeOf<TRPCQueryKeyWithPrefix[2]>();
  expect(infiniteQueryKey).toEqual([
    ['billing'],
    ['list'],
    { type: 'infinite' },
  ]);

  const mutationKey = trpc.m.mutationKey();
  expectTypeOf(mutationKey).toEqualTypeOf<TRPCMutationKeyWithPrefix>();
  expect(mutationKey).toEqual([['billing'], ['m']]);
});

test('createTRPCOptionsProxy: without keyPrefix, keys and key types are unchanged', () => {
  const trpc = createTRPCOptionsProxy({
    router: appRouter,
    ctx: {},
    queryClient: new QueryClient(),
  });

  const pathKey = trpc.q.pathKey();
  expectTypeOf(pathKey).toEqualTypeOf<TRPCQueryKeyWithoutPrefix>();
  expect(pathKey).toEqual([['q']]);

  const queryKey = trpc.q.queryKey();
  expectTypeOf(queryKey[1]?.type).toEqualTypeOf<
    'infinite' | 'query' | undefined
  >();
  expect(queryKey).toEqual([['q'], { type: 'query' }]);

  const mutationKey = trpc.m.mutationKey();
  expectTypeOf(mutationKey).toEqualTypeOf<TRPCMutationKeyWithoutPrefix>();
  expect(mutationKey).toEqual([['m']]);
});

test('createTRPCOptionsProxy: a keyPrefix that may be undefined types keys as either shape', () => {
  const keyPrefix = 'billing' as string | undefined;
  const trpc = createTRPCOptionsProxy({
    client: createClient(),
    queryClient: new QueryClient(),
    keyPrefix,
  });

  expectTypeOf(trpc.q.pathKey()).toEqualTypeOf<AnyTRPCQueryKey>();
  expect(trpc.q.pathKey()).toEqual([['billing'], ['q']]);
});

test('createTRPCOptionsProxy: an explicit router type argument keeps unprefixed keys', () => {
  const trpc = createTRPCOptionsProxy<AppRouter>({
    client: createClient(),
    queryClient: new QueryClient(),
  });
  expectTypeOf(trpc.q.pathKey()).toEqualTypeOf<TRPCQueryKeyWithoutPrefix>();

  createTRPCOptionsProxy<AppRouter>({
    client: createClient(),
    queryClient: new QueryClient(),
    // @ts-expect-error - with an explicit router type argument the prefix can't be inferred; leave it out
    keyPrefix: 'billing',
  });
});

test('createTRPCOptionsProxy: the deprecated feature flag still compiles', () => {
  const trpc = createTRPCOptionsProxy<AppRouter, { keyPrefix: true }>({
    client: createClient(),
    queryClient: new QueryClient(),
    keyPrefix: 'billing',
  });
  expectTypeOf(trpc.q.pathKey()).toEqualTypeOf<TRPCQueryKeyWithPrefix>();
  expect(trpc.q.pathKey()).toEqual([['billing'], ['q']]);

  createTRPCOptionsProxy<AppRouter, { keyPrefix: false }>({
    client: createClient(),
    queryClient: new QueryClient(),
    // @ts-expect-error - an explicit `keyPrefix: false` flag still rejects a prefix
    keyPrefix: 'billing',
  });
});

test('createTRPCContext: TRPCProvider takes keyPrefix without a flag', () => {
  const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

  const keys: unknown[] = [];
  function Component() {
    const trpc = useTRPC();

    // The prefix arrives as a prop, so key types keep the unprefixed shape
    const queryKey = trpc.q.queryKey();
    expectTypeOf(queryKey[1]?.type).toEqualTypeOf<
      'infinite' | 'query' | undefined
    >();
    expectTypeOf(trpc.q.pathKey()).toEqualTypeOf<TRPCQueryKeyWithoutPrefix>();

    keys.push(queryKey, trpc.m.mutationKey());
    return null;
  }

  const queryClient = new QueryClient();
  const trpcClient = createClient();
  render(
    <>
      <TRPCProvider
        trpcClient={trpcClient}
        queryClient={queryClient}
        keyPrefix="billing"
      >
        <Component />
      </TRPCProvider>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <Component />
      </TRPCProvider>
    </>,
  );

  expect(keys).toEqual([
    [['billing'], ['q'], { type: 'query' }],
    [['billing'], ['m']],
    [['q'], { type: 'query' }],
    [['m']],
  ]);
});

test('createTRPCContext: the deprecated feature flag still compiles', () => {
  const { TRPCProvider, useTRPC } = createTRPCContext<
    AppRouter,
    { keyPrefix: true }
  >();

  expectTypeOf<
    ReturnType<ReturnType<typeof useTRPC>['q']['pathKey']>
  >().toEqualTypeOf<TRPCQueryKeyWithPrefix>();
  expectTypeOf<
    React.ComponentProps<typeof TRPCProvider>['keyPrefix']
  >().toEqualTypeOf<string>();
});

test('reading query keys still type-checks', () => {
  function getType<T extends ReturnType<TRPCQueryOptions<any>>>(
    queryOptions: T,
  ) {
    return queryOptions.queryKey[1]?.type === 'infinite' ? 'infinite' : 'query';
  }

  const { useTRPC } = createTRPCContext<AppRouter>();
  function _fromContext(trpc: ReturnType<typeof useTRPC>) {
    return getType(trpc.q.queryOptions());
  }

  const trpc = createTRPCOptionsProxy({
    router: appRouter,
    ctx: {},
    queryClient: new QueryClient(),
  });
  expect(getType(trpc.q.queryOptions())).toBe('query');

  const [path, opts] = trpc.q.queryKey();
  expectTypeOf(path).toEqualTypeOf<string[]>();
  expect(opts?.type).toBe('query');
});

test('procedure types only mention feature flags when keys are prefixed', () => {
  type inferDef<T> =
    T extends DecorateQueryProcedure<infer TDef> ? TDef : never;

  const { useTRPC } = createTRPCContext<AppRouter>();
  type Def = inferDef<ReturnType<typeof useTRPC>['q']>;
  expectTypeOf<keyof Def>().toEqualTypeOf<
    'input' | 'output' | 'transformer' | 'errorShape'
  >();

  const prefixed = createTRPCOptionsProxy({
    client: createClient(),
    queryClient: new QueryClient(),
    keyPrefix: 'billing',
  });
  type PrefixedDef = inferDef<(typeof prefixed)['q']>;
  expectTypeOf<PrefixedDef['featureFlags']>().toEqualTypeOf<{
    keyPrefix: true;
  }>();
});
