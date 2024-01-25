import { routerToServerAndClientNew } from '../server/___testHelpers';
import { initTRPC } from '@trpc/server';
import type { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone';
import DataLoader from 'dataloader';
import { konn } from 'konn';
import { z } from 'zod';

const posts = [
  {
    id: 1,
    text: 'foo',
  },
  {
    id: 2,
    text: 'bar',
  },
];

function createContext(_opts: CreateHTTPContextOptions) {
  return {
    postLoader: new DataLoader(async (ids: readonly number[]) => {
      return ids.map((id) => posts.find((post) => post.id === id));
    }),
  };
}
type Context = Awaited<ReturnType<typeof createContext>>;

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.context<Context>().create();

    const appRouter = t.router({
      post: t.router({
        byId: t.procedure
          .input(
            z.object({
              id: z.number(),
            }),
          )
          .query(({ input, ctx }) => ctx.postLoader.load(input.id)),
      }),
    });
    return routerToServerAndClientNew(appRouter, {
      server: {
        createContext,
      },
    });
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

test('dataloader', async () => {
  const result = await Promise.all([
    ctx.client.post.byId.query({ id: 1 }),
    ctx.client.post.byId.query({ id: 2 }),
  ]);

  expect(result).toEqual([posts[0], posts[1]]);
});
