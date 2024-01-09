import { routerToServerAndClientNew } from '../___testHelpers';
import { createQueryClient } from '../__queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { createTRPCReact, httpBatchLink } from '@trpc/react-query';
import { createServerSideHelpers } from '@trpc/react-query/server';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';
import type { ReactNode } from 'react';
import React, { useState } from 'react';

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create();
    const appRouter = t.router({
      hello: t.procedure.query(() => 'world'),
    });

    const queryClient = createQueryClient();
    const hooks = createTRPCReact<typeof appRouter>();
    const opts = routerToServerAndClientNew(appRouter);

    function App(props: { children: ReactNode }) {
      const [client] = useState(() =>
        hooks.createClient({
          links: [
            httpBatchLink({
              url: opts.httpUrl,
            }),
          ],
        }),
      );
      return (
        <hooks.Provider {...{ queryClient, client }}>
          <QueryClientProvider client={queryClient}>
            {props.children}
          </QueryClientProvider>
        </hooks.Provider>
      );
    }
    return { ...opts, hooks, App };
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

test('createClient()', async () => {
  const { App, hooks } = ctx;
  function MyComponent() {
    const query1 = hooks.hello.useQuery();

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

test('useDehydratedState() - internal', async () => {
  const { App, hooks, router } = ctx;

  const ssg = createServerSideHelpers({ router, ctx: {} });
  const res = await ssg.hello.fetch();
  expect(res).toBe('world');
  const dehydratedState = ssg.dehydrate();

  function MyComponent() {
    const utils = hooks.useUtils();

    const state = hooks.useDehydratedState(utils.client, dehydratedState);
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

test('useDehydratedState() - external', async () => {
  const { App, hooks, client } = ctx;

  const ssg = createServerSideHelpers({ client: client });
  const res = await ssg.hello.fetch();
  expect(res).toBe('world');
  expectTypeOf(res).toMatchTypeOf<string>();

  const dehydratedState = ssg.dehydrate();

  function MyComponent() {
    const utils = hooks.useUtils();

    const state = hooks.useDehydratedState(utils.client, dehydratedState);
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
