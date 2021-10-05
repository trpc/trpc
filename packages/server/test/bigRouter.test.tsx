/* eslint-disable @typescript-eslint/no-non-null-assertion */
import '@testing-library/jest-dom';
import { render, waitFor } from '@testing-library/react';
import { createReactQueryHooks } from '../../react/src';
import { routerToServerAndClient } from './_testHelpers';
import { bigRouter } from './__generated__/bigRouter';
import { kont } from 'kont';
import { QueryClient, QueryClientProvider } from 'react-query';
import { expectTypeOf } from 'expect-type';
import React, { useState } from 'react';

const ctx = kont()
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
    const query500 = trpc.useQuery(['500']);
    expectTypeOf(query500.data!).toMatchTypeOf<'500'>();

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
