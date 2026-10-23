import type { InfiniteData } from '@tanstack/react-query';
import { QueryClient } from '@tanstack/react-query';
import { createServerSideHelpers } from '@trpc/react-query/server';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

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
          cursor: z.string().optional(),
        }),
      )
      .query(() => '__infResult' as const),
    paginated: t.procedure
      .input(
        z.object({
          cursor: z.number().nullish(),
        }),
      )
      .query(({ input }) => {
        const cursor = input.cursor ?? 0;
        return { cursor, nextCursor: cursor + 1 };
      }),
  }),
});

test('fetch', async () => {
  const queryClient = new QueryClient();
  const ssg = createServerSideHelpers({
    router: appRouter,
    ctx: {},
    queryClient,
  });

  const post1 = await queryClient.fetchQuery(
    ssg.post.byId.queryOptions({ id: '1' }),
  );

  const post2 = await ssg.post.byId.fetch({ id: '1' });
  expectTypeOf<'__result'>(post2);
  expectTypeOf(post1).toEqualTypeOf(post2);
});

test('fetchInfinite', async () => {
  const ssg = createServerSideHelpers({ router: appRouter, ctx: {} });

  const post = await ssg.post.list.fetchInfinite({});
  expectTypeOf<InfiniteData<'__infResult', string | null>>(post);

  expect(post.pages).toStrictEqual(['__infResult']);
});

test('fetchInfinite with initialCursor and pages', async () => {
  const ssg = createServerSideHelpers({ router: appRouter, ctx: {} });

  const data = await ssg.post.paginated.fetchInfinite(
    {},
    {
      initialCursor: 5,
      pages: 2,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );

  expect(data).toStrictEqual({
    pages: [
      { cursor: 5, nextCursor: 6 },
      { cursor: 6, nextCursor: 7 },
    ],
    pageParams: [5, 6],
  });
});

test('prefetch and dehydrate', async () => {
  const ssg = createServerSideHelpers({ router: appRouter, ctx: {} });
  await ssg.post.byId.prefetch({ id: '1' });

  const data = JSON.stringify(ssg.dehydrate());
  expect(data).toContain('__result');
});

test('prefetchInfinite and dehydrate', async () => {
  const ssg = createServerSideHelpers({ router: appRouter, ctx: {} });
  await ssg.post.list.prefetchInfinite({});

  const data = JSON.stringify(ssg.dehydrate());
  expect(data).toContain('__infResult');
});

test('prefetchInfinite with initialCursor and pages', async () => {
  const ssg = createServerSideHelpers({ router: appRouter, ctx: {} });
  await ssg.post.paginated.prefetchInfinite(
    {},
    {
      initialCursor: 5,
      pages: 2,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );

  const [query] = ssg.dehydrate().queries;
  expect(query?.state.data).toStrictEqual({
    pages: [
      { cursor: 5, nextCursor: 6 },
      { cursor: 6, nextCursor: 7 },
    ],
    pageParams: [5, 6],
  });
});

test('using queryOptions', async () => {
  const ssg = createServerSideHelpers({ router: appRouter, ctx: {} });

  const opts = ssg.post.byId.queryOptions({ id: '1' });
  //    ^?
  const post = await ssg.queryClient.fetchQuery(
    ssg.post.byId.queryOptions({ id: '1' }),
  );
  expectTypeOf<'__result'>(post);
  expect(post).toStrictEqual('__result');
});

test('using infiniteQueryOptions with initialCursor', async () => {
  const ssg = createServerSideHelpers({ router: appRouter, ctx: {} });

  const data = await ssg.queryClient.fetchInfiniteQuery(
    ssg.post.paginated.infiniteQueryOptions(
      {},
      {
        initialCursor: 5,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      },
    ),
  );
  expect(data).toStrictEqual({
    pages: [{ cursor: 5, nextCursor: 6 }],
    pageParams: [5],
  });
});
