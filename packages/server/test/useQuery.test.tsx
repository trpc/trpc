import { routerToServerAndClientNew } from './___testHelpers';
import { render, waitFor } from '@testing-library/react';
import { expectTypeOf } from 'expect-type';
import { konn } from 'konn';
import React, { ReactNode, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { InfiniteData } from 'react-query';
import { z } from 'zod';
import { createReactQueryHooks, createReactQueryProxy } from '../../react/src';
import { initTRPC } from '../src';

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC()();
    const appRouter = t.router({
      post: t.router({
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
      }),
      /**
       * @deprecated
       */
      deprecatedRouter: t.router({
        /**
         * @deprecated
         */
        deprecatedProcedure: t.procedure.query(() => '..'),
      }),
    });

    const opts = routerToServerAndClientNew(appRouter);
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
      close: opts.close,
      client,
      queryClient,
      react,
      proxy,
      App,
    };
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

test('useQuery()', async () => {
  const { react, proxy, App } = ctx;
  function MyComponent() {
    const query1 = proxy.post.byId.useQuery({
      id: '1',
    });

    // @ts-expect-error Should not exist
    proxy.post.byId.useInfiniteQuery;
    const utils = react.useContext();

    useEffect(() => {
      // utils.invalidateQueries(['post.byId']);
      // @ts-expect-error Should not exist
      utils.invalidateQueries(['doesNotExist']);
    }, [utils]);

    if (!query1.data) {
      return <>...</>;
    }

    type TData = typeof query1['data'];
    expectTypeOf<TData>().toMatchTypeOf<'__result'>();

    return <pre>{JSON.stringify(query1.data ?? 'n/a', null, 4)}</pre>;
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );
  await waitFor(() => {
    expect(utils.container).toHaveTextContent(`__result`);
  });
});

test('useInfiniteQuery()', async () => {
  const { App, proxy } = ctx;
  function MyComponent() {
    const query1 = proxy.post.list.useInfiniteQuery({});

    if (!query1.data) {
      return <>...</>;
    }

    type TData = typeof query1['data'];
    expectTypeOf<TData>().toMatchTypeOf<InfiniteData<'__infResult'>>();

    return <pre>{JSON.stringify(query1.data ?? 'n/a', null, 4)}</pre>;
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );
  await waitFor(() => {
    expect(utils.container).toHaveTextContent(`__infResult`);
  });
});

test('useMutation', async () => {
  const { App, proxy } = ctx;
  function MyComponent() {
    const mutation = proxy.post.create.useMutation();

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

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );
  await waitFor(() => {
    expect(utils.container).toHaveTextContent(`__mutationResult`);
  });
});

test('deprecated routers', async () => {
  const { proxy, App } = ctx;

  function MyComponent() {
    // FIXME this should have strike-through
    proxy.deprecatedRouter.deprecatedProcedure.useQuery();

    return null;
  }

  render(
    <App>
      <MyComponent />
    </App>,
  );
});
