import { getServerAndReactClient } from './__reactHelpers';
import { InfiniteData } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { inferReactQueryProcedureOptions } from '@trpc/react-query';
import { initTRPC } from '@trpc/server/src';
import { expectTypeOf } from 'expect-type';
import { konn } from 'konn';
import React, { useEffect } from 'react';
import { z } from 'zod';

const fixtureData = ['1', '2', '3', '4'];

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
        byIdWithSerializable: t.procedure
          .input(
            z.object({
              id: z.string(),
            }),
          )
          .query(() => ({
            id: 1,
            date: new Date(),
          })),
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

describe('useQuery()', () => {
  test('loading data', async () => {
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

      type TData = (typeof query1)['data'];
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

  test('data type without initialData', () => {
    const expectation = expectTypeOf(() =>
      ctx.proxy.post.byId.useQuery({ id: '1' }),
    ).returns;

    expectation.toMatchTypeOf<{ data: '__result' | undefined }>();
    expectation.not.toMatchTypeOf<{ data: '__result' }>();
  });

  test('data type with initialData', () => {
    const expectation = expectTypeOf(() =>
      ctx.proxy.post.byId.useQuery(
        { id: '1' },
        {
          initialData: {
            id: 1,
            text: '',
          },
        },
      ),
    ).returns;

    expectation.toMatchTypeOf<{ data: '__result' }>();
    expectation.not.toMatchTypeOf<{ data: undefined }>();
  });
});

test('useSuspenseQuery()', async () => {
  const { proxy, App } = ctx;
  function MyComponent() {
    const [data, query1] = proxy.post.byId.useSuspenseQuery({
      id: '1',
    });
    expectTypeOf(data).toEqualTypeOf<'__result'>();

    type TData = typeof data;
    expectTypeOf<TData>().toMatchTypeOf<'__result'>();
    expect(data).toBe('__result');
    expect(query1.data).toBe('__result');

    return <>{query1.data}</>;
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

test('useSuspenseInfiniteQuery()', async () => {
  const { App, proxy } = ctx;
  function MyComponent() {
    const [data, query1] = proxy.post.list.useSuspenseInfiniteQuery(
      {},
      {
        getNextPageParam(lastPage) {
          return lastPage.next;
        },
      },
    );
    expect(query1.trpc.path).toBe('post.list');

    expect(query1.data).not.toBeFalsy();
    expect(data).not.toBeFalsy();

    type TData = (typeof query1)['data'];
    expectTypeOf<TData>().toMatchTypeOf<
      InfiniteData<{
        items: typeof fixtureData;
        next?: number | undefined;
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
        <pre>{JSON.stringify(data, null, 4)}</pre>
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
  await userEvent.click(utils.getByTestId('fetchMore'));

  await waitFor(() => {
    expect(utils.container).toHaveTextContent(`[ "1" ]`);
    expect(utils.container).toHaveTextContent(`[ "2" ]`);
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

    type TData = (typeof query1)['data'];
    expectTypeOf<TData>().toMatchTypeOf<
      InfiniteData<{
        items: typeof fixtureData;
        next?: number | undefined;
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
  await userEvent.click(utils.getByTestId('fetchMore'));

  await waitFor(() => {
    expect(utils.container).toHaveTextContent(`[ "1" ]`);
    expect(utils.container).toHaveTextContent(`[ "2" ]`);
  });
});

test('useInfiniteQuery() initialCursor', async () => {
  const { App, proxy } = ctx;
  function MyComponent() {
    const query1 = proxy.post.list.useInfiniteQuery(
      {},
      {
        getNextPageParam(lastPage) {
          return lastPage.next;
        },
        initialCursor: 2,
      },
    );
    expect(query1.trpc.path).toBe('post.list');

    if (query1.isLoading || query1.isFetching || !query1.data) {
      return <>...</>;
    }

    type TData = (typeof query1)['data'];
    expectTypeOf<TData>().toMatchTypeOf<
      InfiniteData<{
        items: typeof fixtureData;
        next?: number | undefined;
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
    expect(utils.container).toHaveTextContent(`[ "3" ]`);
  });
  await userEvent.click(utils.getByTestId('fetchMore'));

  await waitFor(() => {
    expect(utils.container).toHaveTextContent(`[ "3" ]`);
    expect(utils.container).toHaveTextContent(`[ "4" ]`);
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

test('useQuery options inference', () => {
  const { appRouter, proxy, App } = ctx;

  type ReactQueryProcedure = inferReactQueryProcedureOptions<typeof appRouter>;
  type Options = ReactQueryProcedure['post']['byIdWithSerializable'];

  function MyComponent() {
    const options: Options = {};
    proxy.post.byIdWithSerializable.useQuery(
      { id: '1' },
      {
        ...options,
        onSuccess: (data) => {
          expectTypeOf(data).toMatchTypeOf<{
            id: number;
            date: string;
          }>();
        },
      },
    );

    return <></>;
  }

  render(
    <App>
      <MyComponent />
    </App>,
  );
});
