import { routerToServerAndClientNew } from '../___testHelpers';
import { createQueryClient } from '../__queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { expectTypeOf } from 'expect-type';
import { konn } from 'konn';
import React, { ReactNode, useEffect, useState } from 'react';
import { createTRPCReact, httpBatchLink } from '../../../react/src';
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

test('setData with updater', async () => {
  const { proxy, App } = ctx;
  function MyComponent() {
    const allPosts = proxy.hello.useQuery(undefined, { enabled: false });

    const utils = proxy.useContext();

    useEffect(() => {
      utils.hello.setData((prevData) => {
        expectTypeOf<string | undefined>(prevData);
        return 'Hello world';
      });
    }, [utils]);

    if (!allPosts.data) {
      return <div>...</div>;
    }
    return <p>{allPosts.data[0]}</p>;
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );
  await waitFor(() => {
    expect(utils.container).toHaveTextContent('Hello world');
  });
});
