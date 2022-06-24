import { routerToServerAndClientNew } from './___testHelpers';
import { render, waitFor } from '@testing-library/react';
import { expectTypeOf } from 'expect-type';
import { konn } from 'konn';
import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { InfiniteData } from 'react-query';
import { z } from 'zod';
import { createReactQueryProxy } from '../../react/src';
import { initTRPC } from '../src';

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC()();
    const appRouter = t.router({
      children: {
        post: t.router({
          procedures: {
            byId: t.procedure
              .input(
                z.object({
                  id: z.string(),
                }),
              )
              .query(() => '__result' as const),
            list: t.procedure
              .input(
                z.object({
                  cursor: z.string().optional(),
                }),
              )
              .query(() => '__infResult' as const),
            create: t.procedure
              .input(
                z.object({
                  text: z.string(),
                }),
              )
              .mutation(() => `__mutationResult` as const),
          },
        }),
      },
    });
    const opts = routerToServerAndClientNew(appRouter);
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

test('useQuery()', async () => {
  const { react, client } = ctx;
  function MyComponent() {
    const query1 = react.post.byId.useQuery({
      id: '1',
    });

    // @ts-expect-error Should not exist
    react.post.byId.useInfiniteQuery;

    if (!query1.data) {
      return <>...</>;
    }

    type TData = typeof query1['data'];
    expectTypeOf<TData>().toMatchTypeOf<'__result'>();

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
    expect(utils.container).toHaveTextContent(`__result`);
  });
});

test('useInfiniteQuery()', async () => {
  const { react, client } = ctx;
  function MyComponent() {
    const query1 = react.post.list.useInfiniteQuery({});

    if (!query1.data) {
      return <>...</>;
    }

    type TData = typeof query1['data'];
    expectTypeOf<TData>().toMatchTypeOf<InfiniteData<'__infResult'>>();

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
    expect(utils.container).toHaveTextContent(`__infResult`);
  });
});

test('useMutation', async () => {
  const { react, client } = ctx;
  function MyComponent() {
    const mutation = react.post.create.useMutation();

    useEffect(() => {
      mutation.mutate({
        text: 'hello',
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    if (!mutation.data) {
      return <>...</>;
    }

    type TData = typeof mutation['data'];
    expectTypeOf<TData>().toMatchTypeOf<'__mutationResult'>();

    return <pre>{JSON.stringify(mutation.data ?? 'n/a', null, 4)}</pre>;
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
    expect(utils.container).toHaveTextContent(`__mutationResult`);
  });
});
