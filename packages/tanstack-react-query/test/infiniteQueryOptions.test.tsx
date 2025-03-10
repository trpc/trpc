import { testReactResource } from './__helpers';
import {
  infiniteQueryOptions,
  useInfiniteQuery,
  useQueryClient,
  useSuspenseInfiniteQuery,
  type InfiniteData,
} from '@tanstack/react-query';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TRPCClientErrorLike } from '@trpc/client';
import type { inferRouterError } from '@trpc/server';
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

  return testReactResource(appRouter);
};

describe('infiniteQueryOptions', () => {
  test('basic', async () => {
    await using ctx = testContext();
    const { useTRPC } = ctx;

    function MyComponent() {
      const trpc = useTRPC();
      const queryClient = useQueryClient();
      const [invalidated, setInvalidated] = React.useState(false);

      const queryOptions = trpc.post.list.infiniteQueryOptions(
        {},
        {
          getNextPageParam(lastPage) {
            expectTypeOf<{
              items: string[];
              next?: number | undefined;
            }>(lastPage);
            return lastPage.next;
          },
        },
      );
      const query1 = useInfiniteQuery(queryOptions);
      expect(queryOptions.trpc.path).toBe('post.list');
      if (!query1.data) {
        return <>...</>;
      }

      queryClient.setQueryData(queryOptions.queryKey, (data) => {
        expectTypeOf<typeof data>(query1.data);
        return data;
      });

      //
      // Check that query keys have correct types

      const queryKey = trpc.post.list.infiniteQueryKey({});
      expect(queryOptions.queryKey).toEqual(queryKey);
      expectTypeOf<typeof queryOptions.queryKey>(queryKey);

      const queryData = queryClient.getQueryData(
        trpc.post.list.infiniteQueryKey({}),
      )!;
      expectTypeOf<typeof query1.data>(queryData);
      expect(query1.data).toEqual(queryData);

      //
      // Check that query filters have correct types

      async function invalidate() {
        await queryClient.invalidateQueries(
          trpc.post.list.infiniteQueryFilter(
            {},
            {
              predicate(opts) {
                expectTypeOf<typeof query1.data>(opts.state.data);
                expect(opts.state.data).toEqual(query1.data);
                return true;
              },
            },
          ),
        );
        setInvalidated(true);
      }

      //
      // Check result data type

      expectTypeOf<
        InfiniteData<
          {
            items: typeof fixtureData;
            next?: number | undefined;
          },
          number | null
        >
      >(query1.data);

      //
      // Check error shape

      expectTypeOf<TRPCClientErrorLike<{
        transformer: false;
        errorShape: inferRouterError<typeof ctx.router>;
      }> | null>(query1.error);

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
            data-testid="invalidate"
            onClick={invalidate}
            disabled={invalidated}
          >
            invalidate
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

    await userEvent.click(utils.getByTestId('invalidate'));
    await waitFor(() => {
      expect(utils.getByTestId('invalidate')).toBeDisabled();
    });
  });

  test('basic suspense', async () => {
    await using ctx = testContext();
    const { useTRPC } = ctx;

    function MyComponent() {
      const trpc = useTRPC();
      const queryClient = useQueryClient();
      const [invalidated, setInvalidated] = React.useState(false);

      const queryOptions = trpc.post.list.infiniteQueryOptions(
        {},
        {
          getNextPageParam(lastPage) {
            return lastPage.next;
          },
        },
      );
      const query1 = useSuspenseInfiniteQuery(queryOptions);
      expect(queryOptions.trpc.path).toBe('post.list');

      //
      // Check that query keys have correct types

      expect(queryOptions.queryKey).toEqual(
        trpc.post.list.infiniteQueryKey({}),
      );

      const queryData = queryClient.getQueryData(
        trpc.post.list.infiniteQueryKey({}),
      )!;
      expectTypeOf<typeof query1.data>(queryData);
      expect(query1.data).toEqual(queryData);

      //
      // Check that query filters have correct types

      async function invalidate() {
        await queryClient.invalidateQueries(
          trpc.post.list.infiniteQueryFilter(
            {},
            {
              predicate(opts) {
                expectTypeOf<typeof query1.data>(opts.state.data!);
                expect(opts.state.data).toEqual(query1.data);
                return true;
              },
            },
          ),
        );
        setInvalidated(true);
      }

      //
      // Check result data type

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
            data-testid="invalidate"
            onClick={invalidate}
            disabled={invalidated}
          >
            invalidate
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

    const utils = ctx.renderApp(
      <React.Suspense fallback="loading">
        <MyComponent />
      </React.Suspense>,
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

  test('no infinite on non cursor types', async () => {
    await using ctx = testContext();
    const { useTRPC } = ctx;

    // @ts-expect-error - unused, it's fine
    function Component() {
      const trpc = useTRPC();

      // @ts-expect-error - not an infinite query
      trpc.post.byId.infiniteQueryOptions({ id: '1' });

      // @ts-expect-error - not an infinite query
      trpc.post.byId.infiniteQueryKey({ id: '1' });

      // @ts-expect-error - not an infinite query
      trpc.post.byId.infiniteQueryFilter({ id: '1' });
    }
  });

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
