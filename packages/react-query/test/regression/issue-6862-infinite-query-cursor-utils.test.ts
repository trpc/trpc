import { createQueryClient } from '../__queryClient';
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { createTRPCQueryUtils } from '@trpc/react-query';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';
import { z } from 'zod';

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create();
    const inputSpy = vi.fn();

    const appRouter = t.router({
      posts: t.procedure
        .input(z.object({ cursor: z.number().nullish() }))
        .query(({ input }) => {
          inputSpy(input);
          return { items: ['post'], nextCursor: null };
        }),
    });

    const opts = testServerAndClientResource(appRouter);
    const queryClient = createQueryClient();
    const utils = createTRPCQueryUtils({ queryClient, client: opts.client });

    return { ...opts, queryClient, utils, inputSpy };
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

const cases = [
  {
    name: 'sends a 0 initial cursor',
    initialCursor: 0,
    expectedInput: { cursor: 0 },
  },
  {
    name: 'sends an explicit null initial cursor',
    initialCursor: null,
    expectedInput: { cursor: null },
  },
  {
    name: 'sends no cursor by default',
    initialCursor: undefined,
    expectedInput: {},
  },
];

describe('issue #6862: cursor injection in utility functions', () => {
  test.each(cases)(
    'fetchInfinite() $name',
    async ({ initialCursor, expectedInput }) => {
      await ctx.utils.posts.fetchInfinite({}, { initialCursor });

      expect(ctx.inputSpy.mock.calls).toStrictEqual([[expectedInput]]);
    },
  );

  test.each(cases)(
    'prefetchInfinite() $name',
    async ({ initialCursor, expectedInput }) => {
      await ctx.utils.posts.prefetchInfinite({}, { initialCursor });

      expect(ctx.inputSpy.mock.calls).toStrictEqual([[expectedInput]]);
    },
  );

  test.each(cases)(
    'infiniteQueryOptions() $name',
    async ({ initialCursor, expectedInput }) => {
      const options = ctx.utils.posts.infiniteQueryOptions(
        {},
        {
          initialCursor,
          getNextPageParam: (lastPage) => lastPage.nextCursor,
        },
      );
      const data = await ctx.queryClient.fetchInfiniteQuery(options);

      expect(data.pages).toStrictEqual([{ items: ['post'], nextCursor: null }]);
      expect(ctx.inputSpy.mock.calls).toStrictEqual([[expectedInput]]);
    },
  );
});
