import { createQueryClient } from '../__queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { expectTypeOf } from 'expect-type';
import { konn } from 'konn';
import React, { ReactNode, useEffect, useState } from 'react';
import { createTRPCReact, httpBatchLink } from '../../../react/dist';
import { initTRPC } from '../../src';

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create();
    const appRouter = t.router({
      hello: t.procedure.query(() => 'world'),
    });

    const queryClient = createQueryClient();
    const trpc = createTRPCReact<typeof appRouter>();

    function App(props: { children: ReactNode }) {
      const [client] = useState(() =>
        trpc.createClient({
          links: [
            httpBatchLink({
              url: 'http://localhost:-1',
            }),
          ],
        }),
      );
      return (
        <trpc.Provider {...{ queryClient, client }}>
          <QueryClientProvider client={queryClient}>
            {props.children}
          </QueryClientProvider>
        </trpc.Provider>
      );
    }
    return { trpc, App };
  })
  .done();

test('setData with updater', async () => {
  const { trpc, App } = ctx;
  function MyComponent() {
    const allPosts = trpc.hello.useQuery(undefined, { enabled: false });

    const utils = trpc.useContext();

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
