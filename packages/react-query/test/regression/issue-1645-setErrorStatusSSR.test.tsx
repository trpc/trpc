/* eslint-disable @typescript-eslint/ban-ts-comment */
import { createAppRouter } from '../__testHelpers';
import { withTRPC } from '@trpc/next';
import { ssrPrepass } from '@trpc/next/ssrPrepass';
import type { AppType } from 'next/dist/shared/lib/utils';
import React from 'react';

let factory: ReturnType<typeof createAppRouter>;
beforeEach(() => {
  factory = createAppRouter();
});
afterEach(async () => {
  await factory.close();
});

/**
 * @see https://github.com/trpc/trpc/pull/1645
 */
test('regression: SSR with error sets `status`=`error`', async () => {
  // @ts-ignore
  const { window } = global;

  let queryState: any;
  // @ts-ignore
  delete globalThis.window;
  const { trpc, trpcClientOptions } = factory;
  const App: AppType = () => {
    // @ts-ignore
    const query1 = trpc.bad_useQuery.useQuery();
    // @ts-ignore
    const query2 = trpc.bad_useInfiniteQuery.useInfiniteQuery();
    queryState = {
      query1: {
        status: query1.status,
        error: query1.error,
      },
      query2: {
        status: query2.status,
        error: query2.error,
      },
    };
    return <>{JSON.stringify(query1.data || null)}</>;
  };

  const Wrapped = withTRPC({
    config: () => trpcClientOptions,
    ssr: true,
    ssrPrepass,
  })(App);

  await Wrapped.getInitialProps!({
    AppTree: Wrapped,
    Component: <div />,
  } as any);

  // @ts-ignore
  globalThis.window = window;
  expect(queryState.query1.error).toMatchInlineSnapshot(
    `[TRPCClientError: No procedure found on path "bad_useQuery"]`,
  );
  expect(queryState.query2.error).toMatchInlineSnapshot(
    `[TRPCClientError: No procedure found on path "bad_useInfiniteQuery"]`,
  );
  expect(queryState.query1.status).toBe('error');
  expect(queryState.query2.status).toBe('error');
});
