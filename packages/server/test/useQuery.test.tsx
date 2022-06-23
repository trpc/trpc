import { routerToServerAndClientNew } from './___testHelpers';
import { render, waitFor } from '@testing-library/react';
import { createReactQueryHooksNew } from '@trpc/react';
import { expectTypeOf } from 'expect-type';
import { konn } from 'konn';
import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { initTRPC } from '../src';

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC()();
    const appRouter = t.router({
      children: {
        foo: t.router({
          procedures: {
            bar: t.procedure.query(() => 'baz' as const),
          },
        }),
      },
    });
    const opts = routerToServerAndClientNew(appRouter);
    const queryClient = new QueryClient();
    const react = createReactQueryHooksNew<typeof appRouter>();
    const client = opts.client;

    return {
      close: opts.close,
      client,
      queryClient,
      react,
    };
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

test('useQuery()', async () => {
  const { react, client } = ctx;
  function MyComponent() {
    const query1 = react.foo.bar.useQuery();

    if (!query1.data) {
      return <>...</>;
    }

    type TData = typeof query1['data'];
    expectTypeOf<TData>().toMatchTypeOf<'baz'>();

    return <pre>{JSON.stringify(query1.data ?? 'n/a', null, 4)}</pre>;
  }
  function App() {
    const [queryClient] = useState(() => new QueryClient());
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
    expect(utils.container).toHaveTextContent(`baz`);
  });
});
