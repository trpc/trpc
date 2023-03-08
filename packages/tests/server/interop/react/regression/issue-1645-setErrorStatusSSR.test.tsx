/* eslint-disable @typescript-eslint/ban-ts-comment */
import { createLegacyAppRouter } from '../__testHelpers';
import { withTRPC } from '@trpc/next/src';
import { AppType } from 'next/dist/shared/lib/utils';
import React from 'react';

let factory: ReturnType<typeof createLegacyAppRouter>;
beforeEach(() => {
  factory = createLegacyAppRouter();
});
afterEach(async () => {
  await factory.close();
});

/**
 * @link https://github.com/trpc/trpc/pull/1645
 */
test('regression: SSR with error sets `status`=`error`', async () => {
  // @ts-ignore
  const { window } = global;

  let queryState: any;
  // @ts-ignore
  delete global.window;
  const { trpc, trpcClientOptions } = factory;
  const App: AppType = () => {
    const query1 = trpc.useQuery(['bad-useQuery'] as any);
    const query2 = trpc.useInfiniteQuery(['bad-useInfiniteQuery'] as any);
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
  })(App);

  await Wrapped.getInitialProps!({
    AppTree: Wrapped,
    Component: <div />,
  } as any);

  // @ts-ignore
  global.window = window;
  expect(queryState.query1.error).toMatchInlineSnapshot(
    `[TRPCClientError: No "query"-procedure on path "bad-useQuery"]`,
  );
  expect(queryState.query2.error).toMatchInlineSnapshot(
    `[TRPCClientError: No "query"-procedure on path "bad-useInfiniteQuery"]`,
  );
  expect(queryState.query1.status).toBe('error');
  expect(queryState.query2.status).toBe('error');
});
