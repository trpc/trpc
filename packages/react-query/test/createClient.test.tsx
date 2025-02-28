import { createQueryClient } from './__queryClient';
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { httpBatchLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
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
    const opts = testServerAndClientResource(appRouter);

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
