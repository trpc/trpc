import { InfiniteData } from '@tanstack/react-query';
import { createServerSideExternalHelpers } from '@trpc/react-query/server';
import { initTRPC } from '@trpc/server/src';
import { z } from 'zod';
import { getServerAndReactClient } from './__reactHelpers';
import { konn } from 'konn';

const ctx = konn()
  .beforeEach(() => {
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

    return getServerAndReactClient(appRouter);
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

test('fetch', async () => {
  const { untypedClient, appRouter } = ctx;
  const ssg = createServerSideExternalHelpers<typeof appRouter>({ client: untypedClient });

  const post = await ssg.post.byId.fetch({ id: '1' });
  expectTypeOf<'__result'>(post);
});

test('fetchInfinite', async () => {
  const { untypedClient, appRouter } = ctx;
  const ssg = createServerSideExternalHelpers<typeof appRouter>({ client: untypedClient });

  const post = await ssg.post.list.fetchInfinite({});
  expectTypeOf<InfiniteData<'__infResult'>>(post);

  expect(post.pages).toStrictEqual(['__infResult']);
});

test('prefetch and dehydrate', async () => {
  const { untypedClient, appRouter } = ctx;
  const ssg = createServerSideExternalHelpers<typeof appRouter>({ client: untypedClient });
  await ssg.post.byId.prefetch({ id: '1' });

  const data = JSON.stringify(ssg.dehydrate());
  expect(data).toContain('__result');
});

test('prefetchInfinite and dehydrate', async () => {
  const { untypedClient, appRouter } = ctx;
  const ssg = createServerSideExternalHelpers<typeof appRouter>({ client: untypedClient });
  await ssg.post.list.prefetchInfinite({});

  const data = JSON.stringify(ssg.dehydrate());
  expect(data).toContain('__infResult');
});
