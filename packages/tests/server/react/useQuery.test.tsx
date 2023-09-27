import { getServerAndReactClient } from './__reactHelpers';
import { InfiniteData } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initTRPC } from '@trpc/server/src';
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
          initialData: '__result',
        },
      ),
    ).returns;

    expectation.toMatchTypeOf<{ data: '__result' }>();
    expectation.not.toMatchTypeOf<{ data: undefined }>();
  });
});

test('useInfiniteQuery()', async () => {
  const { App, proxy } = ctx;
  function MyComponent() {
    const trpcContext = proxy.useContext();
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

    expectTypeOf<
      InfiniteData<
        {
          items: typeof fixtureData;
          next?: number | undefined;
        },
        number | null
      >
    >(query1.data);

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
        <button
          data-testid="prefetch"
          onClick={async () => {
            const fetched = await trpcContext.post.list.fetchInfinite({}, {});
            expectTypeOf<{
              pages: { items: typeof fixtureData; next?: number | undefined }[];
              pageParams: (number | null)[];
            }>(fetched);
            expect(
              fetched.pageParams.some((p) => typeof p === 'undefined'),
            ).toBeFalsy();
          }}
        >
          Fetch
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
    expect(utils.container).toHaveTextContent(`null`);
    expect(utils.container).not.toHaveTextContent(`undefined`);
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

    if (query1.isPending || query1.isFetching || !query1.data) {
      return <>...</>;
    }

    expectTypeOf<
      InfiniteData<
        {
          items: typeof fixtureData;
          next?: number | undefined;
        },
        number | null
      >
    >(query1.data);

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
