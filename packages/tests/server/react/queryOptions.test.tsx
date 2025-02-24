import { getServerAndReactClient } from './__reactHelpers';
import {
  infiniteQueryOptions,
  skipToken,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
  type InfiniteData,
} from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initTRPC } from '@trpc/server';
import { createDeferred } from '@trpc/server/unstable-core-do-not-import/stream/utils/createDeferred';
import { konn } from 'konn';
import React from 'react';
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

    const testHelpers = getServerAndReactClient(appRouter);

    function useTRPC() {
      return testHelpers.client.useUtils();
    }

    return {
      ...testHelpers,
      nextIterable,
      useTRPC,
    };
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

describe('queryOptions', () => {
  test('basic', async () => {
    const { useTRPC, App } = ctx;
    function MyComponent() {
      const trpc = useTRPC();
      const queryOptions = trpc.post.byId.queryOptions({ id: '1' });
      expect(queryOptions.trpc.path).toBe('post.byId');
      const query1 = useQuery(queryOptions);

      const query2 = useQuery(trpc.post.byId.queryOptions({ id: '1' }));
      expectTypeOf(query1).toMatchTypeOf(query2);

      if (!query1.data) {
        return <>...</>;
      }

      expectTypeOf(query1.data).toMatchTypeOf<'__result'>();

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

  test('select', async () => {
    const { useTRPC, App } = ctx;
    function MyComponent() {
      const trpc = useTRPC();
      const queryOptions = trpc.post.byId.queryOptions(
        { id: '1' },
        {
          select: (data) => `mutated${data}` as const,
        },
      );
      expect(queryOptions.trpc.path).toBe('post.byId');
      const query1 = useQuery(queryOptions);

      if (!query1.data) {
        return <>...</>;
      }

      expectTypeOf(query1.data).toMatchTypeOf<'mutated__result'>();

      return <pre>{JSON.stringify(query1.data ?? 'n/a', null, 4)}</pre>;
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );
    await waitFor(() => {
      expect(utils.container).toHaveTextContent(`mutated__result`);
    });
  });

  test('initialData', async () => {
    const { useTRPC, App } = ctx;
    function MyComponent() {
      const trpc = useTRPC();
      const queryOptions = trpc.post.byId.queryOptions(
        { id: '1' },
        { initialData: '__result' },
      );
      expect(queryOptions.trpc.path).toBe('post.byId');
      const query1 = useQuery(queryOptions);

      expectTypeOf(query1.data).toEqualTypeOf<'__result'>();

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
    const { useTRPC, App, client } = ctx;
    function MyComponent() {
      const trpc = useTRPC();

      const options = trpc.post.byId.queryOptions(skipToken);
      const query1 = useQuery(options);

      const query2 = useQuery(trpc.post.byId.queryOptions(skipToken));

      expectTypeOf(query1.data).toMatchTypeOf<'__result' | undefined>();
      expectTypeOf(query2.data).toMatchTypeOf<'__result' | undefined>();

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

  test('with extra `trpc` context', async () => {
    const { useTRPC, App } = ctx;

    const context = {
      __TEST__: true,
    };

    function MyComponent() {
      const trpc = useTRPC();
      const queryOptions = trpc.post.byId.queryOptions(
        { id: '1' },
        { trpc: { context } },
      );
      expect(queryOptions.trpc.path).toBe('post.byId');
      const query1 = useQuery(queryOptions);

      if (!query1.data) {
        return <>...</>;
      }

      expectTypeOf(query1.data).toMatchTypeOf<'__result'>();

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

    expect(ctx.spyLink.mock.calls[0]![0].context).toMatchObject(context);
  });

  test('iterable', async () => {
    const { useTRPC, App } = ctx;
    const states: {
      status: string;
      data: unknown;
      fetchStatus: string;
    }[] = [];
    const selects: number[][] = [];

    function MyComponent() {
      const trpc = useTRPC();
      const opts = trpc.post.iterable.queryOptions(undefined, {
        select(data) {
          expectTypeOf<number[]>(data);
          selects.push(data);
          return data;
        },
        trpc: {
          context: {
            stream: 1,
          },
        },
      });
      const query1 = useQuery(opts);
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

    expect(selects).toEqual([
      [],
      [],
      [1],
      [1],
      [1, 2],
      [1, 2],
      [1, 2, 3],
      [1, 2, 3],
    ]);

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

  test('useSuspenseQuery', async () => {
    const { App, useTRPC } = ctx;
    function MyComponent() {
      const trpc = useTRPC();
      const { data } = useSuspenseQuery(
        trpc.post.byId.queryOptions({ id: '1' }),
      );

      expectTypeOf(data).toMatchTypeOf<'__result'>();

      return <pre>{JSON.stringify(data ?? 'n/a', null, 4)}</pre>;
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
});

//
// ---
//

describe('infiniteQueryOptions', () => {
  test('basic', async () => {
    const { App, useTRPC } = ctx;
    function MyComponent() {
      const trpc = useTRPC();
      const queryClient = useQueryClient();

      const queryOptions = trpc.post.list.infiniteQueryOptions(
        {},
        {
          getNextPageParam(lastPage) {
            return lastPage.next;
          },
        },
      );
      const query1 = useInfiniteQuery(queryOptions);
      expect(queryOptions.trpc.path).toBe('post.list');
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
              const fetched =
                await queryClient.fetchInfiniteQuery(queryOptions);
              expectTypeOf<{
                pages: {
                  items: typeof fixtureData;
                  next?: number | undefined;
                }[];
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

  // TODO:
  // test('no infinite on non cursor types', () => {
  //   const { useTRPC } = ctx;

  //   ignoreErrors(() => {
  //     const trpc = useTRPC();

  //     // @ts-expect-error - not an infinite query
  //     trpc.post.byId.infiniteQueryOptions({ id: '1' });
  //   });
  // });

  test('select', async () => {
    const { App, useTRPC } = ctx;
    function MyComponent() {
      const trpc = useTRPC();
      const queryClient = useQueryClient();

      infiniteQueryOptions;
      const queryOptions = trpc.post.list.infiniteQueryOptions(
        {},
        {
          getNextPageParam(lastPage) {
            return lastPage.next;
          },
          select(opts) {
            return {
              ...opts,
              pages: opts.pages.map((page) => {
                return {
                  ...page,
                  items: page.items,
                  ___selected: true as const,
                };
              }),
            };
          },
        },
      );
      const query1 = useInfiniteQuery(queryOptions);
      expect(queryOptions.trpc.path).toBe('post.list');
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

      expectTypeOf(query1.data.pages[0]?.___selected).toEqualTypeOf<
        true | undefined
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
          <button
            data-testid="prefetch"
            onClick={async () => {
              const fetched =
                await queryClient.fetchInfiniteQuery(queryOptions);
              expectTypeOf<{
                pages: {
                  items: typeof fixtureData;
                  next?: number | undefined;
                }[];
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

    await waitFor(() => {
      expect(utils.container).toHaveTextContent('__selected');
    });
  });
});
