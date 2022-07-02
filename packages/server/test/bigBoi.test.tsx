import { routerToServerAndClientNew } from './___testHelpers';
import { appRouter } from './__generated__/bigBoi/_app';
import { render, waitFor } from '@testing-library/react';
import { createReactQueryHooks, createReactQueryProxy } from '@trpc/react';
import { expectTypeOf } from 'expect-type';
import { konn } from 'konn';
import React, { ReactNode, useState } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';

const ctx = konn()
  .beforeEach(() => {
    const opts = routerToServerAndClientNew(appRouter, {});
    const queryClient = new QueryClient();
    const react = createReactQueryHooks<typeof appRouter>();
    const proxy = createReactQueryProxy<typeof appRouter>();
    const client = opts.client;
    function App(props: { children: ReactNode }) {
      const [queryClient] = useState(() => new QueryClient());
      return (
        <react.Provider {...{ queryClient, client }}>
          <QueryClientProvider client={queryClient}>
            {props.children}
          </QueryClientProvider>
        </react.Provider>
      );
    }

    return {
      App,
      close: opts.close,
      client,
      queryClient,
      proxy,
    };
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

test('vanilla', async () => {
  const { client } = ctx;
  {
    const result = await client.r0.greeting.query({ who: 'KATT' });

    expect(result).toBe('hello KATT');
    expectTypeOf(result).not.toBeAny();
    expectTypeOf(result).toMatchTypeOf<string>();
  }
  {
    const result = await client.r10.grandchild.grandChildMutation.mutate();
    expect(result).toBe('grandChildMutation');
  }

  {
    const result = await client.r499.greeting.query({ who: 'KATT' });

    expect(result).toBe('hello KATT');
    expectTypeOf(result).not.toBeAny();
    expectTypeOf(result).toMatchTypeOf<string>();
  }
});

test('useQuery()', async () => {
  const { proxy, App } = ctx;
  function MyComponent() {
    const query1 = proxy.r499.greeting.useQuery({ who: 'KATT' });

    if (!query1.data) {
      return <>...</>;
    }
    expectTypeOf(query1.data).not.toBeAny();
    expectTypeOf(query1.data).toMatchTypeOf<string>();
    return <pre>{JSON.stringify(query1.data ?? 'n/a', null, 4)}</pre>;
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );
  await waitFor(() => {
    expect(utils.container).toHaveTextContent(`hello KATT`);
  });
});
