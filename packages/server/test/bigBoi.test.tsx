import { routerToServerAndClientNew } from './___testHelpers';
import { appRouter } from './__generated__/bigBoi/_app';
import { render, waitFor } from '@testing-library/react';
import { createReactQueryProxy } from '@trpc/react';
import { expectTypeOf } from 'expect-type';
import { konn } from 'konn';
import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';

const ctx = konn()
  .beforeEach(() => {
    const opts = routerToServerAndClientNew(appRouter, {});
    const queryClient = new QueryClient();
    const react = createReactQueryProxy<typeof appRouter>();
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
  const { react, client } = ctx;
  function MyComponent() {
    const query1 = react.r499.greeting.useQuery({ who: 'KATT' });

    if (!query1.data) {
      return <>...</>;
    }
    expectTypeOf(query1.data).not.toBeAny();
    expectTypeOf(query1.data).toMatchTypeOf<string>();
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
    expect(utils.container).toHaveTextContent(`hello KATT`);
  });
});
