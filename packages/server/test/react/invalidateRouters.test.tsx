import { getServerAndReactClient } from './__reactHelpers';
import { useIsFetching } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { konn } from 'konn';
import React from 'react';
import { z } from 'zod';
import { initTRPC } from '../../src';

const ctx = konn()
  .beforeEach(() => {
    /**
     * An object of jest functions we can use to track how many times things
     * have been called during invalidation etc.
     */
    const resolvers = {
      user: {
        listAll: jest.fn(),
        byId: {
          '1': jest.fn(),
          '2': jest.fn(),
        },
        details: {
          getByUserId: {
            '1': jest.fn(),
            '2': jest.fn(),
          },
        },
      },
      'user.current.email.getMain': jest.fn(),
      posts: {
        getAll: jest.fn(),
        byId: {
          '1': jest.fn(),
          '2': jest.fn(),
        },
        'comments.getById': {
          1: jest.fn(),
          2: jest.fn(),
        },
      },
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
          return `posts.getAll` as const;
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
const useSetupAllTestHooks = (proxy: typeof ctx['proxy']) => {
  const hooks = {
    user: {
      listAll: proxy.user.listAll.useQuery(),
      byId: {
        '1': proxy.user.byId.useQuery({ userId: '1' }),
        '2': proxy.user.byId.useQuery({ userId: '2' }),
      },
      details: {
        getByUserId: {
          '1': proxy.user.details.getByUserId.useQuery({ userId: '1' }),
          '2': proxy.user.details.getByUserId.useQuery({ userId: '2' }),
        },
      },
    },
    'user.current.email.getMain': proxy['user.current.email.getMain'].useQuery({
      getExtraDetails: false,
    }), // Really not a fan of allowing `.` in property names...
    posts: {
      getAll: proxy.posts.getAll.useQuery(),
      byId: {
        '1': proxy.posts.byId.useQuery({ id: '1' }),
        '2': proxy.posts.byId.useQuery({ id: '2' }),
      },
      'comments.getById': {
        1: proxy.posts['comments.getById'].useQuery({ id: 1 }),
        2: proxy.posts['comments.getById'].useQuery({ id: 2 }),
      },
    },
  };

  return {
    hooks,
  };
};

//---------------------------------------------------------------------------------------------------

test('Check invalidation of Whole router', async () => {
  const { proxy, App, resolvers } = ctx;
  function MyComponent() {
    useSetupAllTestHooks(ctx.proxy);
    const isFetching = useIsFetching();

    const utils = proxy.useContext();

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
});

//---------------------------------------------------------------------------------------------------

test('Check invalidating at router root invalidates all', async () => {
  const { proxy, App, resolvers } = ctx;
  function MyComponent() {
    useSetupAllTestHooks(ctx.proxy);
    const isFetching = useIsFetching();

    const utils = proxy.useContext();

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
});

//---------------------------------------------------------------------------------------------------

test('Check invalidation when filtering by input', async () => {
  const { proxy, App, resolvers } = ctx;
  function MyComponent() {
    useSetupAllTestHooks(ctx.proxy);
    const isFetching = useIsFetching();

    const utils = proxy.useContext();

    return (
      <div>
        {isFetching ? (
          <p>{`Still fetching ${isFetching} queries`}</p>
        ) : (
          <p>All queries finished fetching!</p>
        )}
        <button
          data-testid="invalidate-queries-with-userid-1-from-user-router"
          onClick={() => {
            utils.user.invalidate({ userId: '1' });
          }}
        />
        <button
          data-testid="invalidate-queries-with-userid-1-from-router-root"
          onClick={() => {
            utils.invalidate({ userId: '1' });
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

  await userEvent.click(
    utils.getByTestId('invalidate-queries-with-userid-1-from-user-router'),
  );

  await waitFor(() => {
    expect(utils.container).toHaveTextContent(`All queries finished fetching!`);
  });

  // Invalidated!
  expect(resolvers.user.byId[1]).toHaveBeenCalledTimes(2);
  expect(resolvers.user.details.getByUserId['1']).toHaveBeenCalledTimes(2);

  // Untouched!
  expect(resolvers.user.byId[2]).toHaveBeenCalledTimes(1);
  expect(resolvers.user.details.getByUserId['2']).toHaveBeenCalledTimes(1);
  expect(resolvers.user.listAll).toHaveBeenCalledTimes(1);
  expect(resolvers['user.current.email.getMain']).toHaveBeenCalledTimes(1);
  expect(resolvers.posts.byId[1]).toHaveBeenCalledTimes(1);
  expect(resolvers.posts.byId[2]).toHaveBeenCalledTimes(1);
  expect(resolvers.posts['comments.getById'][1]).toHaveBeenCalledTimes(1);
  expect(resolvers.posts['comments.getById'][2]).toHaveBeenCalledTimes(1);
  expect(resolvers.posts.getAll).toHaveBeenCalledTimes(1);

  await userEvent.click(
    utils.getByTestId('invalidate-queries-with-userid-1-from-router-root'),
  );

  await waitFor(() => {
    expect(utils.container).toHaveTextContent(`All queries finished fetching!`);
  });

  // Invalidated!
  expect(resolvers.user.byId[1]).toHaveBeenCalledTimes(3);
  expect(resolvers.user.details.getByUserId['1']).toHaveBeenCalledTimes(3);

  // Untouched!
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

//---------------------------------------------------------------------------------------------------

test('test TS types of the input variable', async () => {
  const { proxy, App, resolvers } = ctx;
  function MyComponent() {
    useSetupAllTestHooks(ctx.proxy);
    const isFetching = useIsFetching();

    const utils = proxy.useContext();

    const tsInputTypeTests = () => {
      // @ts-expect-error UserID should be string type
      utils.invalidate({ userId: 1 });

      // @ts-expect-error UserID should not allow "3" as it's not in union
      utils.invalidate({ userId: '3' });

      // @ts-expect-error from user.details should not see id from `posts.byid`
      utils.user.details.invalidate({ id: '2' });

      // ID should accept string and number as it is used twice posts.byId & posts.[comments.getById]
      utils.invalidate({ id: 1 });
      utils.invalidate({ id: '1' });

      //TODO: FIX ME!!!! Currently our types for `input` cannot look up the tree
      //for any procedures that have been defined using `.`'s in the procedure
      //name and so faux appear in the current router being invalidated... here
      //['user.current.email.getMain'] would be invalidated as it will have a
      //key of `[['user','current','email','getMain'], {getExtraDetails:true}] but it's input
      //`getExtraDetails:boolean` is not available in the types for input
      // See: !!ADD GITHUB ISSUE!!
      // @ts-expect-error REMOVE AND FIX TYPE INFERENCE EDGE CASE ... 🤯
      utils.user.invalidate({ getExtraDetails: true });

      //It will however be available at root.
      utils.invalidate({ getExtraDetails: false });
    };

    return (
      <div>
        {isFetching ? (
          <p>{`Still fetching ${isFetching} queries`}</p>
        ) : (
          <p>All queries finished fetching!</p>
        )}
        <button
          data-testid="invalidate-queries-with-userid-1"
          onClick={() => {
            utils.user.invalidate({ userId: '1' });
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
