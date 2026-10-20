import { getServerAndReactClient } from '../__reactHelpers';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';
import React from 'react';
import { z } from 'zod';

/**
 * Regression test for issue #6862
 * https://github.com/trpc/trpc/issues/6862
 *
 * The cursor schema is intentionally strict: `z.number().nullable()` requires
 * the cursor field to be present (null is accepted, undefined/missing is not).
 * Using `.nullish()` or `.default(null)` would mask the bug because Zod would
 * silently supply the missing field.
 *
 * The pre-fix code used a truthy check (`pageParam ? { cursor } : {}`) which
 * treated null as falsy, omitting the cursor field entirely and causing a Zod
 * "Required" validation error. The fix switches to a strict `!== undefined`
 * check so that null and 0 are forwarded correctly.
 *
 * For schemas where the cursor can be null, callers must pass `initialCursor:
 * null` to `useInfiniteQuery` so that tRPC forwards null (rather than
 * `undefined`) as the initial pageParam.
 */

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create();

    const posts = [
      { id: 0, title: 'first post' },
      { id: 1, title: 'second post' },
      { id: 2, title: 'third post' },
    ];

    const appRouter = t.router({
      posts: t.procedure
        .input(
          z.object({
            // Strict: required field, accepts null, no default.
            // Must fail if cursor is not injected at all.
            cursor: z.number().nullable(),
          }),
        )
        .query(({ input }) => {
          const offset = input.cursor ?? 0;
          return {
            items: [posts[offset]!],
            nextCursor: offset + 1 < posts.length ? offset + 1 : null,
          };
        }),
    });

    return getServerAndReactClient(appRouter);
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

test('issue #6862: useInfiniteQuery loads on initial render with strict nullable cursor', async () => {
  const { App, client } = ctx;

  function MyComponent() {
    const q = client.posts.useInfiniteQuery(
      {},
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        initialCursor: null,
      },
    );

    if (q.status === 'error') return <p>Error: {q.error.message}</p>;
    if (q.status !== 'success') return <p>Loading...</p>;

    return (
      <>
        {q.data.pages.map((page, i) => (
          <div key={i}>
            {page.items.map((post) => (
              <div key={post.id}>{post.title}</div>
            ))}
          </div>
        ))}
      </>
    );
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );

  await vi.waitFor(() => {
    expect(utils.container).toHaveTextContent('first post');
  });
});

test('issue #6862: useInfiniteQuery works after refetch when cursor resets to initialCursor', async () => {
  const { App, client } = ctx;

  function MyComponent() {
    const q = client.posts.useInfiniteQuery(
      {},
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        initialCursor: null,
      },
    );

    if (q.status === 'error') return <p>Error: {q.error.message}</p>;
    if (q.status !== 'success') return <p>Loading...</p>;

    return (
      <>
        {q.data.pages.map((page, i) => (
          <div key={i}>
            {page.items.map((post) => (
              <div key={post.id}>{post.title}</div>
            ))}
          </div>
        ))}
        <button onClick={() => q.refetch()} data-testid="refetch">
          Refetch
        </button>
      </>
    );
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );

  await vi.waitFor(() => {
    expect(utils.container).toHaveTextContent('first post');
  });

  await userEvent.click(utils.getByTestId('refetch'));

  await vi.waitFor(() => {
    expect(utils.container).toHaveTextContent('first post');
  });
});
