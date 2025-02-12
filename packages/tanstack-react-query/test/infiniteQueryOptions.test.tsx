import { getServerAndReactClient } from './__helpers';
import {
  infiniteQueryOptions,
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initTRPC } from '@trpc/server';
import * as React from 'react';
import { describe, expect, expectTypeOf, test } from 'vitest';
import { z } from 'zod';

const fixtureData = ['1', '2', '3', '4'];

const testContext = () => {
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
};

describe('infiniteQueryOptions', () => {
  test('basic', async () => {
    await using ctx = testContext();
    const { useTRPC } = ctx;

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

    const utils = ctx.renderApp(<MyComponent />);

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
    await using ctx = testContext();
    const { useTRPC } = ctx;

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

      expectTypeOf(query1.data.pages[0]!.___selected).toEqualTypeOf<true>();

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

    const utils = ctx.renderApp(<MyComponent />);

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
