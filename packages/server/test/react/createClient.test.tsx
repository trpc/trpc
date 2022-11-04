import { routerToServerAndClientNew } from '../___testHelpers';
import { createQueryClient } from '../__queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { konn } from 'konn';
import React, { ReactNode, useState } from 'react';
import { createTRPCReact, httpBatchLink } from '../../../react-query/src';
import { createProxySSGHelpers } from '../../../react-query/src/ssg';
import { initTRPC } from '../../src';

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create();
    const appRouter = t.router({
      hello: t.procedure.query(() => 'world'),
    });

    const queryClient = createQueryClient();
    const proxy = createTRPCReact<typeof appRouter>();
    const opts = routerToServerAndClientNew(appRouter);

    function App(props: { children: ReactNode }) {
      const [client] = useState(() =>
        proxy.createClient({
          links: [
            httpBatchLink({
              url: opts.httpUrl,
            }),
          ],
        }),
      );
      return (
        <proxy.Provider {...{ queryClient, client }}>
          <QueryClientProvider client={queryClient}>
            {props.children}
          </QueryClientProvider>
        </proxy.Provider>
      );
    }
    return { ...opts, proxy, App };
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

test('createClient()', async () => {
  const { App, proxy } = ctx;
  function MyComponent() {
    const query1 = proxy.hello.useQuery();

    if (!query1.data) {
      return <>...</>;
    }

    return <pre>{query1.data}</pre>;
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );

  await waitFor(() => {
    expect(utils.container).toHaveTextContent('world');
  });
});

test('useDehydratedState()', async () => {
  const { App, proxy, router } = ctx;

  const ssg = createProxySSGHelpers({ router, ctx: {} });
  const res = await ssg.hello.fetch();
  expect(res).toBe('world');
  const dehydratedState = ssg.dehydrate();

  function MyComponent() {
    const utils = proxy.useContext();

    const state = proxy.useDehydratedState(utils.client, dehydratedState);
    return <h1>{JSON.stringify(state)}</h1>;
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );

  await waitFor(() => {
    expect(utils.container).toHaveTextContent('world');
  });
});
