import { getServerAndReactClient } from './__reactHelpers';
import type { InfiniteData } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';
import React, { Suspense } from 'react';
import { z } from 'zod';

const fixtureData = ['1', '2', '3', '4'];

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create();
    const appRouter = t.router({
      post: t.router({
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

test('useSuspenseInfiniteQuery()', async () => {
  const { App, client } = ctx;
  function MyComponent() {
    const [data, query1] = client.post.list.useSuspenseInfiniteQuery(
      {},
      {
        getNextPageParam(lastPage) {
          return lastPage.next;
        },
      },
    );
    expect(query1.trpc.path).toBe('post.list');

    expect(query1.data).not.toBeFalsy();
    expect(data).not.toBeFalsy();

    expectTypeOf<
      InfiniteData<
        {
          items: typeof fixtureData;
          next?: number | undefined;
        },
        number | undefined
      >
    >(query1.data);

    expectTypeOf<
      InfiniteData<
        {
          items: typeof fixtureData;
          next?: number | undefined;
        },
        number | undefined
      >
    >(data);

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
        <pre>{JSON.stringify(data, null, 4)}</pre>
      </>
    );
  }

  const utils = render(
    <App>
      <Suspense fallback="loading">
        <MyComponent />
      </Suspense>
    </App>,
  );
  await waitFor(() => {
    expect(utils.container).toHaveTextContent(`[ "1" ]`);
  });
  await userEvent.click(utils.getByTestId('fetchMore'));

  await waitFor(() => {
    expect(utils.container).toHaveTextContent(`[ "1" ]`);
    expect(utils.container).toHaveTextContent(`[ "2" ]`);
  });
});
