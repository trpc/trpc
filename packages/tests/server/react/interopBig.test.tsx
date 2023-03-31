import { routerToServerAndClientNew } from '../___testHelpers';
import { appRouter as bigV10Router } from '../__generated__/bigBoi/_app';
import { bigRouter as bigV9Router } from '../__generated__/bigLegacyRouter/bigRouter';
import { createQueryClient } from '../__queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { createReactQueryHooks } from '@trpc/react-query/src';
import { initTRPC } from '@trpc/server/src';
import { expectTypeOf } from 'expect-type';
import { konn } from 'konn';
import React, { useState } from 'react';

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create();

    const legacyRouterInterop = bigV9Router.interop();

    const appRouter = t.mergeRouters(legacyRouterInterop, bigV10Router);

    const opts = routerToServerAndClientNew(appRouter, {});
    const queryClient = createQueryClient();
    const react = createReactQueryHooks<(typeof opts)['router']>();
    const client = opts.client;

    return {
      opts,
      close: opts.close,
      client,
      queryClient,
      react,
      appRouter,
    };
  })
  .afterEach(async (ctx) => {
    await ctx?.opts?.close?.();
  })
  .done();

test('vanilla', async () => {
  const res = await ctx.client.query('oldProc100');
  expectTypeOf(res).toEqualTypeOf<'100'>();
  expect(res).toBe('100');
});

test('react', async () => {
  const { react, client } = ctx;

  function MyComponent() {
    const query1 = react.proxy.r499.greeting.useQuery({ who: 'KATT' });

    if (!query1.data) {
      return <>...</>;
    }
    expectTypeOf(query1.data).not.toBeAny();
    expectTypeOf(query1.data).toMatchTypeOf<string>();
    return <pre>{JSON.stringify(query1.data ?? 'n/a', null, 4)}</pre>;
  }
  function App() {
    const [queryClient] = useState(() => createQueryClient());
    return (
      <react.Provider {...{ queryClient, client }}>
        <QueryClientProvider client={queryClient}>
          <MyComponent />
        </QueryClientProvider>
      </react.Provider>
    );
  }

  const utils = render(<App />);

  await waitFor(() => {
    expect(utils.container).toHaveTextContent(`hello KATT`);
  });
});
