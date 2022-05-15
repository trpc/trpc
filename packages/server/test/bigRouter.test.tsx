/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { bigRouter } from './__generated__/bigRouter';
import { routerToServerAndClient } from './__testHelpers';
import '@testing-library/jest-dom';
import { render, waitFor } from '@testing-library/react';
import { expectTypeOf } from 'expect-type';
import { konn } from 'konn';
import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { createReactQueryHooks } from '../../react/src';

const ctx = konn()
  .beforeEach(() => {
    const server = routerToServerAndClient(bigRouter, {});
    const queryClient = new QueryClient();
    const trpc = createReactQueryHooks<typeof bigRouter>();
    return {
      server,
      queryClient,
      trpc,
    };
  })
  .afterEach((ctx) => {
    ctx.server?.close();
  })
  .done();
test('useQuery()', async () => {
  const { trpc } = ctx;
  const { client } = ctx.server;
  function MyComponent() {
    const query1 = trpc.useQuery(['1']);
    expectTypeOf(query1.data!).toMatchTypeOf<'1'>();
    const query20 = trpc.useQuery(['20']);
    expectTypeOf(query20.data!).toMatchTypeOf<'20'>();
    const query200 = trpc.useQuery(['200']);
    expectTypeOf(query200.data!).toMatchTypeOf<'200'>();

    return <pre>{JSON.stringify(query20.data ?? 'n/a', null, 4)}</pre>;
  }
  function App() {
    const [queryClient] = useState(() => new QueryClient());
    return (
      <trpc.Provider {...{ queryClient, client }}>
        <QueryClientProvider client={queryClient}>
          <MyComponent />
        </QueryClientProvider>
      </trpc.Provider>
    );
  }

  const utils = render(<App />);
  await waitFor(() => {
    expect(utils.container).toHaveTextContent(`20`);
  });
});
