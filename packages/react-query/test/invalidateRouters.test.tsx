import { getServerAndReactClient } from './__reactHelpers';
import { ignoreErrors } from '@trpc/server/__tests__/suppressLogs';
import { useIsFetching } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';
import React from 'react';
import { z } from 'zod';

export type Post = {
  id: string;
  title: string;
  createdAt: number;
};

const ctx = konn()
  .beforeEach(() => {
    /**
     * An object of Vitest functions we can use to track how many times things
     * have been called during invalidation etc.
     */
    const resolvers = {
      user: {
        listAll: vi.fn(),
        byId: {
          '1': vi.fn(),
          '2': vi.fn(),
        },
        details: {
          getByUserId: {
            '1': vi.fn(),
            '2': vi.fn(),
          },
        },
      },
      'user.current.email.getMain': vi.fn(),
      posts: {
        getAll: vi.fn(),
        getAllInfinite: vi.fn(),
        byId: {
          '1': vi.fn(),
          '2': vi.fn(),
        },
        'comments.getById': {
          1: vi.fn(),
          2: vi.fn(),
        },
      },
    };

    const db: {
      posts: Post[];
    } = {
      posts: [
        { id: '1', title: 'first post', createdAt: 0 },
        { id: '2', title: 'second post', createdAt: 1 },
      ],
    };

    const t = initTRPC.create({
      errorFormatter({ shape }) {
        return {
          ...shape,
          data: {
            ...shape.data,
          },
        };
      },
    });
    const appRouter = t.router({
      user: t.router({
        listAll: t.procedure.query(() => {
          resolvers.user.listAll();
          return 'user.listAll' as const;
        }),

        // A procedure and a sub router defined procedure that also both share
        // an input variable.
        byId: t.procedure
          .input(
            z.object({
              userId: z.union([z.literal('1'), z.literal('2')]),
            }),
          )
          .query(({ input: { userId } }) => {
            resolvers.user.byId[userId]();
            return `user.byId[${userId}]` as const;
          }),
        details: t.router({
          getByUserId: t.procedure
            .input(
              z.object({
                userId: z.union([z.literal('1'), z.literal('2')]),
              }),
            )
            .query(({ input: { userId } }) => {
              resolvers.user.details.getByUserId[userId]();
              return `user.details.getByUserId[${userId}]` as const;
            }),
        }),
      }),
      // Add an example top level query defined using `.` to faux being a user sub router.
      'user.current.email.getMain': t.procedure
        .input(
          z.object({
            getExtraDetails: z.boolean(),
          }),
        )
        .query(() => {
          resolvers['user.current.email.getMain']();
          return '[user.current.email.getMain]' as const;
        }),

      // Another sub router that should not be affected when operating on the
      // user router.
      posts: t.router({
        getAll: t.procedure.query(() => {
          resolvers.posts.getAll();
          return `posts.getAll`;
        }),

        getAllInfinite: t.procedure
          .input(
            z.object({
              limit: z.number().min(1).max(100).nullish(),
              cursor: z.number().nullish(),
            }),
          )
          .query(({ input }) => {
            resolvers.posts.getAllInfinite();
            const items: typeof db.posts = [];
            const limit = input.limit ?? 50;
            const { cursor } = input;
            let nextCursor: typeof cursor = null;
            for (const element of db.posts) {
              if (cursor != null && element.createdAt < cursor) {
                continue;
              }
              items.push(element);
              if (items.length >= limit) {
                break;
              }
            }
            const last = items[items.length - 1];
            const nextIndex = db.posts.findIndex((item) => item === last) + 1;
            if (db.posts[nextIndex]) {
              nextCursor = db.posts[nextIndex].createdAt;
            }
            return {
              items,
              nextCursor,
            };
          }),

        // Define two procedures that have the same property but different
        // types.
        byId: t.procedure
          .input(
            z.object({
              id: z.union([z.literal('1'), z.literal('2')]),
            }),
          )
          .query(({ input: { id } }) => {
            resolvers.posts.byId[id]();
            return `posts.byId[${id}]` as const;
          }),

        'comments.getById': t.procedure
          .input(
            z.object({
              id: z.union([z.literal(1), z.literal(2)]),
            }),
          )
          .query(({ input: { id } }) => {
            resolvers.posts['comments.getById'][id]();
            return `posts.[comments.getById][${id}]` as const;
          }),
      }),
    });

    return { ...getServerAndReactClient(appRouter), resolvers };
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

/**
 * A hook that will subscribe the component to all the hooks for the
 * invalidation test.
 */
const useSetupAllTestHooks = (client: (typeof ctx)['client']) => {
  const hooks = {
    user: {
      listAll: client.user.listAll.useQuery(),
      byId: {
        '1': client.user.byId.useQuery({ userId: '1' }),
        '2': client.user.byId.useQuery({ userId: '2' }),
      },
      details: {
        getByUserId: {
          '1': client.user.details.getByUserId.useQuery({ userId: '1' }),
          '2': client.user.details.getByUserId.useQuery({ userId: '2' }),
        },
      },
    },
    'user.current.email.getMain': client['user.current.email.getMain'].useQuery(
      {
        getExtraDetails: false,
      },
    ), // Really not a fan of allowing `.` in property names...
    posts: {
      getAll: client.posts.getAll.useQuery(),
      getAllInfinite: client.posts.getAllInfinite.useInfiniteQuery(
        {
          limit: 1,
        },
        {
          getNextPageParam: (lastPage) => lastPage.nextCursor,
        },
      ),
      byId: {
        '1': client.posts.byId.useQuery({ id: '1' }),
        '2': client.posts.byId.useQuery({ id: '2' }),
      },
      'comments.getById': {
        1: client.posts['comments.getById'].useQuery({ id: 1 }),
        2: client.posts['comments.getById'].useQuery({ id: 2 }),
      },
    },
  };

  return {
    hooks,
  };
};

//---------------------------------------------------------------------------------------------------

test('Check invalidation of Whole router', async () => {
  const { client, App, resolvers } = ctx;
  function MyComponent() {
    useSetupAllTestHooks(ctx.client);
    const isFetching = useIsFetching();

    const utils = client.useUtils();

    return (
      <div>
        {isFetching ? (
          <p>{`Still fetching ${isFetching} queries`}</p>
        ) : (
          <p>All queries finished fetching!</p>
        )}
        <button
          data-testid="invalidate-user-router"
          onClick={() => {
            utils.user.invalidate();
          }}
        />
      </div>
    );
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );

  await waitFor(() => {
    expect(utils.container).toHaveTextContent(`All queries finished fetching!`);
  });

  await userEvent.click(utils.getByTestId('invalidate-user-router'));

  await waitFor(() => {
    expect(utils.container).toHaveTextContent(`All queries finished fetching!`);
  });

  // Invalidated!
  expect(resolvers.user.byId[1]).toHaveBeenCalledTimes(2);
  expect(resolvers.user.byId[2]).toHaveBeenCalledTimes(2);
  expect(resolvers.user.details.getByUserId['1']).toHaveBeenCalledTimes(2);
  expect(resolvers.user.details.getByUserId['2']).toHaveBeenCalledTimes(2);
  expect(resolvers.user.listAll).toHaveBeenCalledTimes(2);
  // Notice this one is defined using a `.` key at the top router level and still gets
  // invalidated. This is due to React Query keys being split by . so
  // `[['user','current','email','getMain']]`
  // See: https://github.com/trpc/trpc/pull/2713#issuecomment-1249121655
  // and: https://github.com/trpc/trpc/issues/2737
  expect(resolvers['user.current.email.getMain']).toHaveBeenCalledTimes(2);

  // Untouched!
  expect(resolvers.posts.byId[1]).toHaveBeenCalledTimes(1);
  expect(resolvers.posts.byId[2]).toHaveBeenCalledTimes(1);
  expect(resolvers.posts['comments.getById'][1]).toHaveBeenCalledTimes(1);
  expect(resolvers.posts['comments.getById'][2]).toHaveBeenCalledTimes(1);
  expect(resolvers.posts.getAll).toHaveBeenCalledTimes(1);
  expect(resolvers.posts.getAllInfinite).toHaveBeenCalledTimes(1);
});

//---------------------------------------------------------------------------------------------------

test('Check invalidating at router root invalidates all', async () => {
  const { client, App, resolvers } = ctx;
  function MyComponent() {
    useSetupAllTestHooks(ctx.client);
    const isFetching = useIsFetching();

    const utils = client.useUtils();

    return (
      <div>
        {isFetching ? (
          <p>{`Still fetching ${isFetching} queries`}</p>
        ) : (
          <p>All queries finished fetching!</p>
        )}
        <button
          data-testid="invalidate-all"
          onClick={() => {
            utils.invalidate();
          }}
        />
      </div>
    );
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );

  await waitFor(() => {
    expect(utils.container).toHaveTextContent(`All queries finished fetching!`);
  });

  await userEvent.click(utils.getByTestId('invalidate-all'));

  await waitFor(() => {
    expect(utils.container).toHaveTextContent(`All queries finished fetching!`);
  });

  // Invalidated!
  expect(resolvers.user.byId[1]).toHaveBeenCalledTimes(2);
  expect(resolvers.user.byId[2]).toHaveBeenCalledTimes(2);
  expect(resolvers.user.details.getByUserId['1']).toHaveBeenCalledTimes(2);
  expect(resolvers.user.details.getByUserId['2']).toHaveBeenCalledTimes(2);
  expect(resolvers.user.listAll).toHaveBeenCalledTimes(2);
  expect(resolvers['user.current.email.getMain']).toHaveBeenCalledTimes(2);
  expect(resolvers.posts.byId[1]).toHaveBeenCalledTimes(2);
  expect(resolvers.posts.byId[2]).toHaveBeenCalledTimes(2);
  expect(resolvers.posts['comments.getById'][1]).toHaveBeenCalledTimes(2);
  expect(resolvers.posts['comments.getById'][2]).toHaveBeenCalledTimes(2);
  expect(resolvers.posts.getAll).toHaveBeenCalledTimes(2);
  // Invalidate should invalidate infinite queries as well as normal queries
  expect(resolvers.posts.getAllInfinite).toHaveBeenCalledTimes(2);
});

//---------------------------------------------------------------------------------------------------

test('test TS types of the input variable', async () => {
  const { client, App, resolvers } = ctx;
  function MyComponent() {
    useSetupAllTestHooks(ctx.client);
    const isFetching = useIsFetching();

    const utils = client.useUtils();

    ignoreErrors(() => {
      // @ts-expect-error from user.details should not see id from `posts.byid`
      utils.user.details.getByUserId.invalidate({ id: '2' });
    });

    return (
      <div>
        {isFetching ? (
          <p>{`Still fetching ${isFetching} queries`}</p>
        ) : (
          <p>All queries finished fetching!</p>
        )}
      </div>
    );
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );

  await waitFor(() => {
    expect(utils.container).toHaveTextContent(`All queries finished fetching!`);
  });

  // No invalidation actually occurred.
  expect(resolvers.user.byId[1]).toHaveBeenCalledTimes(1);
  expect(resolvers.user.details.getByUserId['1']).toHaveBeenCalledTimes(1);
  expect(resolvers.user.byId[2]).toHaveBeenCalledTimes(1);
  expect(resolvers.user.details.getByUserId['2']).toHaveBeenCalledTimes(1);
  expect(resolvers.user.listAll).toHaveBeenCalledTimes(1);
  expect(resolvers['user.current.email.getMain']).toHaveBeenCalledTimes(1);
  expect(resolvers.posts.byId[1]).toHaveBeenCalledTimes(1);
  expect(resolvers.posts.byId[2]).toHaveBeenCalledTimes(1);
  expect(resolvers.posts['comments.getById'][1]).toHaveBeenCalledTimes(1);
  expect(resolvers.posts['comments.getById'][2]).toHaveBeenCalledTimes(1);
  expect(resolvers.posts.getAll).toHaveBeenCalledTimes(1);
});
