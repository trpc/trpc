import { getServerAndReactClient } from '../__reactHelpers';
import { ignoreErrors } from '@trpc/server/__tests__/suppressLogs';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';
import { z } from 'zod';

const fixtureData = ['1', '2'];

const input = z
  .object({
    cursor: z.number(),
    foo: z.literal('bar').optional().default('bar'),
  })
  .optional()
  .default({ cursor: 0, foo: 'bar' });

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create();

    const appRouter = t.router({
      post: t.router({
        list: t.procedure.input(input).query(({ input }) => {
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
  const { client } = ctx;

  ignoreErrors(() => {
    client.post.list.useQuery();
    client.post.list.useSuspenseQuery();
  });
});
