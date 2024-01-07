import { ignoreErrors } from '../___testHelpers';
import { createQueryClient } from '../__queryClient';
import type { Post } from './__testHelpers';
import { createAppRouter } from './__testHelpers';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createServerSideHelpers } from '@trpc/react-query/server';
import type { inferProcedureInput } from '@trpc/server';
import React, { Fragment, useState } from 'react';

let factory: ReturnType<typeof createAppRouter>;
beforeEach(() => {
  factory = createAppRouter();
});
afterEach(async () => {
  await factory.close();
});

describe('Infinite Query', () => {
  test('useInfiniteQuery()', async () => {
    const { trpc, App } = factory;

    function MyComponent() {
      const q = trpc.paginatedPosts.useInfiniteQuery(
        {
          limit: 1,
        },
        {
          getNextPageParam: (lastPage) => lastPage.nextCursor,
        },
      );

      expectTypeOf(q.data?.pages[0]!.items).toMatchTypeOf<Post[] | undefined>();

      return q.status === 'pending' ? (
        <p>Loading...</p>
      ) : q.status === 'error' ? (
        <p>Error: {q.error.message}</p>
      ) : (
        <>
          {q.data?.pages.map((group, i) => (
            <Fragment key={i}>
              {group.items.map((msg) => (
                <Fragment key={msg.id}>
                  <div>{msg.title}</div>
                </Fragment>
              ))}
            </Fragment>
          ))}
          <div>
            <button
              onClick={() => q.fetchNextPage()}
              disabled={!q.hasNextPage || q.isFetchingNextPage}
              data-testid="loadMore"
            >
              {q.isFetchingNextPage
                ? 'Loading more...'
                : q.hasNextPage
                ? 'Load More'
                : 'Nothing more to load'}
            </button>
          </div>
          <div>
            {q.isFetching && !q.isFetchingNextPage ? 'Fetching...' : null}
          </div>
        </>
      );
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );
    await waitFor(() => {
      expect(utils.container).toHaveTextContent('first post');
    });
    await waitFor(() => {
      expect(utils.container).toHaveTextContent('first post');
      expect(utils.container).not.toHaveTextContent('second post');
      expect(utils.container).toHaveTextContent('Load More');
    });
    await userEvent.click(utils.getByTestId('loadMore'));
    await waitFor(() => {
      expect(utils.container).toHaveTextContent('Loading more...');
    });
    await waitFor(() => {
      expect(utils.container).toHaveTextContent('first post');
      expect(utils.container).toHaveTextContent('second post');
      expect(utils.container).toHaveTextContent('Nothing more to load');
    });

    expect(utils.container).toMatchInlineSnapshot(`
    <div>
      <div>
        first post
      </div>
      <div>
        second post
      </div>
      <div>
        <button
          data-testid="loadMore"
          disabled=""
        >
          Nothing more to load
        </button>
      </div>
      <div />
    </div>
  `);
  });

  test('useInfiniteQuery and prefetchInfiniteQuery', async () => {
    const { trpc, App } = factory;

    function MyComponent() {
      const trpcContext = trpc.useUtils();
      const q = trpc.paginatedPosts.useInfiniteQuery(
        {
          limit: 1,
        },
        {
          getNextPageParam: (lastPage) => lastPage.nextCursor,
        },
      );

      expectTypeOf(q.data?.pages[0]?.items).toMatchTypeOf<Post[] | undefined>();

      return q.status === 'pending' ? (
        <p>Loading...</p>
      ) : q.status === 'error' ? (
        <p>Error: {q.error.message}</p>
      ) : (
        <>
          {q.data?.pages.map((group, i) => (
            <Fragment key={i}>
              {group.items.map((msg) => (
                <Fragment key={msg.id}>
                  <div>{msg.title}</div>
                </Fragment>
              ))}
            </Fragment>
          ))}
          <div>
            <button
              onClick={() => q.fetchNextPage()}
              disabled={!q.hasNextPage || q.isFetchingNextPage}
              data-testid="loadMore"
            >
              {q.isFetchingNextPage
                ? 'Loading more...'
                : q.hasNextPage
                ? 'Load More'
                : 'Nothing more to load'}
            </button>
          </div>
          <div>
            <button
              data-testid="prefetch"
              onClick={() =>
                trpcContext.paginatedPosts.prefetchInfinite(
                  { limit: 1 },
                  {
                    pages: 3,
                    getNextPageParam: (lastPage) => lastPage.nextCursor,
                  },
                )
              }
            >
              Prefetch
            </button>
          </div>
          <div>
            {q.isFetching && !q.isFetchingNextPage ? 'Fetching...' : null}
          </div>
        </>
      );
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );
    await waitFor(() => {
      expect(utils.container).toHaveTextContent('first post');
    });
    await waitFor(() => {
      expect(utils.container).toHaveTextContent('first post');
      expect(utils.container).not.toHaveTextContent('second post');
      expect(utils.container).toHaveTextContent('Load More');
    });
    await userEvent.click(utils.getByTestId('loadMore'));
    await waitFor(() => {
      expect(utils.container).toHaveTextContent('Loading more...');
    });
    await waitFor(() => {
      expect(utils.container).toHaveTextContent('first post');
      expect(utils.container).toHaveTextContent('second post');
      expect(utils.container).toHaveTextContent('Nothing more to load');
    });

    expect(utils.container).toMatchInlineSnapshot(`
    <div>
      <div>
        first post
      </div>
      <div>
        second post
      </div>
      <div>
        <button
          data-testid="loadMore"
          disabled=""
        >
          Nothing more to load
        </button>
      </div>
      <div>
        <button
          data-testid="prefetch"
        >
          Prefetch
        </button>
      </div>
      <div />
    </div>
  `);

    await userEvent.click(utils.getByTestId('prefetch'));
    await waitFor(() => {
      expect(utils.container).toHaveTextContent('Fetching...');
    });
    await waitFor(() => {
      expect(utils.container).not.toHaveTextContent('Fetching...');
    });

    // It should correctly fetch both pages
    expect(utils.container).toHaveTextContent('first post');
    expect(utils.container).toHaveTextContent('second post');
  });

  test('useInfiniteQuery and fetchInfiniteQuery', async () => {
    const { trpc, App } = factory;

    function MyComponent() {
      const trpcContext = trpc.useUtils();
      const q = trpc.paginatedPosts.useInfiniteQuery(
        {
          limit: 1,
        },
        {
          getNextPageParam: (lastPage) => lastPage.nextCursor,
        },
      );
      expectTypeOf(q.data?.pages[0]?.items).toMatchTypeOf<Post[] | undefined>();

      return q.status === 'pending' ? (
        <p>Loading...</p>
      ) : q.status === 'error' ? (
        <p>Error: {q.error.message}</p>
      ) : (
        <>
          {q.data?.pages.map((group, i) => (
            <Fragment key={i}>
              {group.items.map((msg) => (
                <Fragment key={msg.id}>
                  <div>{msg.title}</div>
                </Fragment>
              ))}
            </Fragment>
          ))}
          <div>
            <button
              onClick={() => q.fetchNextPage()}
              disabled={!q.hasNextPage || q.isFetchingNextPage}
              data-testid="loadMore"
            >
              {q.isFetchingNextPage
                ? 'Loading more...'
                : q.hasNextPage
                ? 'Load More'
                : 'Nothing more to load'}
            </button>
          </div>
          <div>
            <button
              data-testid="fetch"
              onClick={() =>
                trpcContext.paginatedPosts.fetchInfinite(
                  { limit: 1 },
                  {
                    pages: 3,
                    getNextPageParam: (lastPage) => lastPage.nextCursor,
                  },
                )
              }
            >
              Fetch
            </button>
          </div>
          <div>
            {q.isFetching && !q.isFetchingNextPage ? 'Fetching...' : null}
          </div>
        </>
      );
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );
    await waitFor(() => {
      expect(utils.container).toHaveTextContent('first post');
    });
    await waitFor(() => {
      expect(utils.container).toHaveTextContent('first post');
      expect(utils.container).not.toHaveTextContent('second post');
      expect(utils.container).toHaveTextContent('Load More');
    });
    await userEvent.click(utils.getByTestId('loadMore'));
    await waitFor(() => {
      expect(utils.container).toHaveTextContent('Loading more...');
    });
    await waitFor(() => {
      expect(utils.container).toHaveTextContent('first post');
      expect(utils.container).toHaveTextContent('second post');
      expect(utils.container).toHaveTextContent('Nothing more to load');
    });

    expect(utils.container).toMatchInlineSnapshot(`
    <div>
      <div>
        first post
      </div>
      <div>
        second post
      </div>
      <div>
        <button
          data-testid="loadMore"
          disabled=""
        >
          Nothing more to load
        </button>
      </div>
      <div>
        <button
          data-testid="fetch"
        >
          Fetch
        </button>
      </div>
      <div />
    </div>
  `);

    await userEvent.click(utils.getByTestId('fetch'));
    await waitFor(() => {
      expect(utils.container).toHaveTextContent('Fetching...');
    });
    await waitFor(() => {
      expect(utils.container).not.toHaveTextContent('Fetching...');
    });

    // It should correctly fetch both pages
    expect(utils.container).toHaveTextContent('first post');
    expect(utils.container).toHaveTextContent('second post');
  });

  test('prefetchInfiniteQuery()', async () => {
    const { appRouter } = factory;
    const ssg = createServerSideHelpers({ router: appRouter, ctx: {} });

    {
      await ssg.paginatedPosts.prefetchInfinite({ limit: 1 });
      const data = JSON.stringify(ssg.dehydrate());
      expect(data).toContain('first post');
      expect(data).not.toContain('second post');
    }
    {
      await ssg.paginatedPosts.fetchInfinite({ limit: 2 });
      const data = JSON.stringify(ssg.dehydrate());
      expect(data).toContain('first post');
      expect(data).toContain('second post');
    }
  });

  test('useInfiniteQuery() is exposed on procedure with optional inputs', () => {
    const { trpc, appRouter } = factory;

    type AppRouter = typeof appRouter;
    type Input = inferProcedureInput<AppRouter['paginatedPosts']>;

    type Extends<T, U> = T extends U ? true : false;

    // Optional procedure inputs are unioned with void | undefined.

    assertType<Extends<Input, { cursor?: string }>>(false);
    assertType<Extends<Input, { cursor?: string } | void>>(true);
    assertType<Extends<Input, { cursor?: string } | undefined>>(true);
    assertType<Extends<Input, { cursor?: string } | undefined | void>>(true);

    // Assert 'useInfiniteQuery' is exposed in 'trpc.paginatedPosts'.

    expectTypeOf(trpc.paginatedPosts.useInfiniteQuery).toBeFunction();
  });

  test('useInfiniteQuery() is **not** exposed if there is not cursor', () => {
    ignoreErrors(async () => {
      // @ts-expect-error 'cursor' is required
      factory.trpc.postById.useInfiniteQuery;
      const ssg = createServerSideHelpers({
        router: factory.appRouter,
        ctx: {},
      });

      // good
      await ssg.paginatedPosts.fetchInfinite({ limit: 1 });

      // @ts-expect-error 'cursor' is required
      await ssg.postById.fetchInfinite({ limit: 1 });
    });
  });
});
