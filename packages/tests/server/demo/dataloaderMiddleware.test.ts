import { routerToServerAndClientNew } from '../___testHelpers';
import { initTRPC } from '@trpc/server/src';
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

type Context = {
  dataloaders: Record<string, DataLoader<unknown, unknown>>;
};

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.context<Context>().create();

    type PostLoader = DataLoader<number, typeof posts[number] | undefined>;
    const createPostLoader = vi.fn(
      (): PostLoader =>
        new DataLoader(async (ids) => {
          return ids.map((id) => posts.find((post) => post.id === id));
        }),
    );
    const appRouter = t.router({
      post: t.router({
        byId: t.procedure
          .input(
            z.object({
              id: z.number(),
            }),
          )
          .use((opts) => {
            const postLoader = (opts.ctx.dataloaders[opts.path] =
              opts.ctx.dataloaders[opts.path] ??
              createPostLoader()) as PostLoader;

            return opts.next({
              ctx: {
                postLoader,
              },
            });
          })
          .query(({ input, ctx }) => ctx.postLoader.load(input.id)),
      }),
    });
    const opts = routerToServerAndClientNew(appRouter, {
      server: {
        createContext() {
          return {
            dataloaders: {},
          };
        },
      },
    });
    return {
      ...opts,
      createPostLoader,
    };
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

test('dataloader', async () => {
  const result = await Promise.all([
    ctx.proxy.post.byId.query({ id: 1 }),
    ctx.proxy.post.byId.query({ id: 2 }),
  ]);

  expect(result).toEqual([posts[0], posts[1]]);

  expect(ctx.createPostLoader).toHaveBeenCalledTimes(1);
});
