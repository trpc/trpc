import { getServerAndReactClient } from '../react/__reactHelpers';
import { InfiniteData, dehydrate } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { expectTypeOf } from 'expect-type';
import { konn } from 'konn';
import React from 'react';
import { z } from 'zod';
import { initTRPC } from '../../src';

const fixtureData = ['1', '2'];

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create({
      errorFormatter({ shape }) {
        return {
          ...shape,
          data: {
            ...shape.data,
            foo: 'bar' as const,
          },
        };
      },
    });
    const appRouter = t.router({
      post: t.router({
        list: t.procedure
          .input(
            z.object({
              cursor: z.number().default(0),
              foo: z.literal('bar').optional().default('bar'),
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

test('with input', async () => {
  const { App, proxy } = ctx;
  function MyComponent() {
    const utils = proxy.useContext();
    const query1 = proxy.post.list.useInfiniteQuery(
      {
        foo: 'bar',
      },
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

    type TData = typeof query1['data'];
    expectTypeOf<TData>().toMatchTypeOf<
      InfiniteData<{
        items: typeof fixtureData;
        next: number | undefined;
      }>
    >();

    return (
      <>
        <button
          data-testid="setInfinite"
          onClick={() => {
            utils.post.list.setInfiniteData((data) => data, {
              foo: 'bar',
            });
          }}
        >
          Fetch more
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
  });
  const before = JSON.parse(JSON.stringify(dehydrate(ctx.queryClient)));
  utils.getByTestId('setInfinite').click();
  await new Promise((resolve) => setTimeout(resolve, 100));

  const after = JSON.parse(JSON.stringify(dehydrate(ctx.queryClient)));

  expect(before).toEqual(after);
});

test('w/o input', async () => {
  const { App, proxy } = ctx;
  function MyComponent() {
    const utils = proxy.useContext();
    const query1 = proxy.post.list.useInfiniteQuery(
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

    type TData = typeof query1['data'];
    expectTypeOf<TData>().toMatchTypeOf<
      InfiniteData<{
        items: typeof fixtureData;
        next: number | undefined;
      }>
    >();

    return (
      <>
        <button
          data-testid="setInfinite"
          onClick={() => {
            utils.post.list.setInfiniteData((data) => data);
          }}
        >
          Fetch more
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
  });
  const before = JSON.parse(JSON.stringify(dehydrate(ctx.queryClient)));
  utils.getByTestId('setInfinite').click();
  await new Promise((resolve) => setTimeout(resolve, 100));

  const after = JSON.parse(JSON.stringify(dehydrate(ctx.queryClient)));

  expect(before).toEqual(after);
});
