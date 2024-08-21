import type { InfiniteData } from '@tanstack/react-query';
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
  }),
});

test('fetch', async () => {
  const ssg = createServerSideHelpers({ router: appRouter, ctx: {} });

  const post = await ssg.post.byId.fetch({ id: '1' });
  expectTypeOf<'__result'>(post);
});

test('fetchInfinite', async () => {
  const ssg = createServerSideHelpers({ router: appRouter, ctx: {} });

  const post = await ssg.post.list.fetchInfinite({});
  expectTypeOf<InfiniteData<'__infResult', string | null>>(post);

  expect(post.pages).toStrictEqual(['__infResult']);
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
