import { getServerAndReactClient } from './__reactHelpers';
import { InfiniteData } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { initTRPC } from '@trpc/server/src';
import { expectTypeOf } from 'expect-type';
import { konn } from 'konn';
import React, { useEffect } from 'react';
import { z } from 'zod';

const fixtureData = ['1', '2'];

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create({
      errorFormatter({ shape }) {
        return {
          ...shape,
          data: {
            ...shape.data,
            foo: 'bar' as const,
          },
        };
      },
    });
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
              cursor: z.number().default(0),
            }),
          )
          .query(({ input }) => {
            return {
              items: fixtureData.slice(input.cursor, input.cursor + 1),
              next:
                input.cursor + 1 > fixtureData.length
                  ? undefined
                  : input.cursor + 1,
            };
          }),
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

    return getServerAndReactClient(appRouter);
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

test('useQuery()', async () => {
  const { proxy, App } = ctx;
  function MyComponent() {
    const query1 = proxy.post.byId.useQuery({
      id: '1',
    });

    expect(query1.trpc.path).toBe('post.byId');

    // @ts-expect-error Should not exist
    proxy.post.byId.useInfiniteQuery;
    const utils = proxy.useContext();

    useEffect(() => {
      utils.post.byId.invalidate();
      // @ts-expect-error Should not exist
      utils.doesNotExist.invalidate();
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

test('useSuspenseQuery()', async () => {
  const { proxy, App } = ctx;
  function MyComponent() {
    const query1 = proxy.post.byId.useSuspenseQuery({
      id: '1',
    });
    expectTypeOf(query1.data).toEqualTypeOf<'__result'>();

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
    const query1 = proxy.post.list.useInfiniteQuery(
      {},
      {
        getNextPageParam(lastPage) {
          return lastPage.next;
        },
      },
    );
    expect(query1.trpc.path).toBe('post.list');

    if (!query1.data) {
      return <>...</>;
    }

    type TData = typeof query1['data'];
    expectTypeOf<TData>().toMatchTypeOf<
      InfiniteData<{
        items: typeof fixtureData;
        next: number | undefined;
      }>
    >();

    return (
      <>
        <button
          data-testid="fetchMore"
          onClick={() => {
            query1.fetchNextPage();
          }}
        >
          Fetch more
        </button>
        <pre>{JSON.stringify(query1.data ?? 'n/a', null, 4)}</pre>
      </>
    );
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );
  await waitFor(() => {
    expect(utils.container).toHaveTextContent(`[ "1" ]`);
  });
  utils.getByTestId('fetchMore').click();

  await waitFor(() => {
    expect(utils.container).toHaveTextContent(`[ "1" ]`);
    expect(utils.container).toHaveTextContent(`[ "2" ]`);
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
