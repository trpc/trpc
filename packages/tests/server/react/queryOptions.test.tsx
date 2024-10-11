import { waitMs } from '../___testHelpers';
import { getServerAndReactClient } from './__reactHelpers';
import {
  skipToken,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';
import React, { useEffect } from 'react';
import { z } from 'zod';

const fixtureData = ['1', '2', '3', '4'];

const ctx = konn()
  .beforeEach(() => {
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
      }),
    });

    const testHelpers = getServerAndReactClient(appRouter);

    function useTRPC() {
      return testHelpers.client.useUtils();
    }

    return {
      ...testHelpers,
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
    const { useTRPC, App } = ctx;
    function MyComponent() {
      const trpc = useTRPC();
      const query1 = useQuery(trpc.post.byId.queryOptions(skipToken));

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
});

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
              const fetched = await queryClient.fetchInfiniteQuery(
                queryOptions,
              );
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
});
