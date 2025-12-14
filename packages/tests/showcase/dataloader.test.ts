import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { initTRPC } from '@trpc/server';
import type { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone';
import DataLoader from 'dataloader';
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

test('dataloader', async () => {
  const t = initTRPC.context<Context>().create();

  const appRouter = t.router({
    post: t.router({
      byId: t.procedure
        .input(
          z.object({
            id: z.number(),
          }),
        )
        .query((opts) => opts.ctx.postLoader.load(opts.input.id)),
    }),
  });

  await using ctx = testServerAndClientResource(appRouter, {
    server: {
      createContext,
    },
  });

  const result = await Promise.all([
    ctx.client.post.byId.query({ id: 1 }),
    ctx.client.post.byId.query({ id: 2 }),
  ]);

  expect(result).toEqual([posts[0], posts[1]]);
});
