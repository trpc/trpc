import { getServerAndReactClient } from './__reactHelpers';
import { skipToken, type InfiniteData } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initTRPC } from '@trpc/server';
import { createDeferred } from '@trpc/server/unstable-core-do-not-import';
import { konn } from 'konn';
import React, { useEffect } from 'react';
import { z } from 'zod';

const fixtureData = ['1', '2', '3', '4'];

const ctx = konn()
  .beforeEach(() => {
    let iterableDeferred = createDeferred();
    const nextIterable = () => {
      iterableDeferred.resolve();
      iterableDeferred = createDeferred();
    };
    const t = initTRPC.create({});

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
        iterable: t.procedure.query(async function* () {
          for (let i = 0; i < 3; i++) {
            await iterableDeferred.promise;
            yield i + 1;
          }
        }),
      }),
    });

    return {
      nextIterable,
      ...getServerAndReactClient(appRouter),
    };
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

describe('useQuery()', () => {
  test('loading data', async () => {
    const { client, App } = ctx;
    function MyComponent() {
      const query1 = client.post.byId.useQuery({
        id: '1',
      });

      expect(query1.trpc.path).toBe('post.byId');

      // @ts-expect-error Should not exist
      client.post.byId.useInfiniteQuery;
      const utils = client.useUtils();

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

  test('disabling query with skipToken', async () => {
    const { client, App } = ctx;
    function MyComponent() {
      const query1 = client.post.byId.useQuery(skipToken);

      type TData = (typeof query1)['data'];
      expectTypeOf<TData>().toMatchTypeOf<'__result' | undefined>();

      return <pre>{query1.status}</pre>;
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );
    await waitFor(() => {
      expect(utils.container).toHaveTextContent(`pending`);
    });
  });

  test('conditionally enabling query with skipToken', async () => {
    const { client, App } = ctx;
    let onEnable: () => void;
    function MyComponent() {
      const [enabled, setEnabled] = React.useState(false);
      const query1 = client.post.byId.useQuery(
        enabled
          ? {
              id: '1',
            }
          : skipToken,
      );

      onEnable = () => {
        setEnabled(true);
      };

      return (
        <pre>
          {query1.status}:{query1.isFetching ? 'fetching' : 'notFetching'}
        </pre>
      );
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );
    await waitFor(() => {
      expect(utils.container).toHaveTextContent(`pending:notFetching`);
    });

    expect(utils.container).toHaveTextContent(`pending:notFetching`);

    await waitFor(() => {
      onEnable!();
      expect(utils.container).toHaveTextContent(`pending:fetching`);
    });
    await waitFor(() => {
      expect(utils.container).toHaveTextContent(`success:notFetching`);
    });
  });

  test('data type without initialData', () => {
    const expectation = expectTypeOf(() =>
      ctx.client.post.byId.useQuery({ id: '1' }),
    ).returns;

    expectation.toMatchTypeOf<{ data: '__result' | undefined }>();
    expectation.not.toMatchTypeOf<{ data: '__result' }>();
  });

  test('data type with initialData', () => {
    const expectation = expectTypeOf(() =>
      ctx.client.post.byId.useQuery(
        { id: '1' },
        {
          initialData: '__result',
        },
      ),
    ).returns;

    expectation.toMatchTypeOf<{ data: '__result' }>();
    expectation.not.toMatchTypeOf<{ data: undefined }>();
  });

  test('data type with conditional skipToken', () => {
    const expectation = expectTypeOf(() =>
      ctx.client.post.byId.useQuery(
        Math.random() > 0.5 ? skipToken : { id: '1' },
      ),
    ).returns;

    expectation.toMatchTypeOf<{ data: '__result' | undefined }>();
    expectation.not.toMatchTypeOf<{ data: undefined }>();
  });

  test('iterable', async () => {
    const { client, App } = ctx;
    const states: {
      status: string;
      data: unknown;
      fetchStatus: string;
    }[] = [];
    function MyComponent() {
      const query1 = client.post.iterable.useQuery(undefined, {
        trpc: {
          context: {
            stream: 1,
          },
        },
      });
      states.push({
        status: query1.status,
        data: query1.data,
        fetchStatus: query1.fetchStatus,
      });
      ctx.nextIterable();

      expectTypeOf(query1.data!).toMatchTypeOf<number[]>();

      return (
        <pre>
          {query1.status}:{query1.isFetching ? 'fetching' : 'notFetching'}
        </pre>
      );
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );
    await waitFor(() => {
      expect(utils.container).toHaveTextContent(`success:notFetching`);
    });

    expect(states.map((s) => [s.status, s.fetchStatus])).toEqual([
      // initial
      ['pending', 'fetching'],
      // waiting 3 values
      ['success', 'fetching'],
      ['success', 'fetching'],
      ['success', 'fetching'],
      // done iterating
      ['success', 'idle'],
    ]);
    expect(states).toMatchInlineSnapshot(`
      Array [
        Object {
          "data": undefined,
          "fetchStatus": "fetching",
          "status": "pending",
        },
        Object {
          "data": Array [],
          "fetchStatus": "fetching",
          "status": "success",
        },
        Object {
          "data": Array [
            1,
          ],
          "fetchStatus": "fetching",
          "status": "success",
        },
        Object {
          "data": Array [
            1,
            2,
          ],
          "fetchStatus": "fetching",
          "status": "success",
        },
        Object {
          "data": Array [
            1,
            2,
            3,
          ],
          "fetchStatus": "idle",
          "status": "success",
        },
      ]
    `);
  });
});

test('useInfiniteQuery()', async () => {
  const { App, client } = ctx;
  function MyComponent() {
    const trpcContext = client.useContext();
    const query1 = client.post.list.useInfiniteQuery(
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
        number | undefined
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
