/**
 * @see https://trpc.io/blog/tinyrpc-client
 */
import '../server/___packages';
import '@trpc/server';
import { TRPCError, initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { z } from 'zod';
import { createTinyRPCClient } from './tinyrpc';

if (!global.fetch) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fetch = require('node-fetch');
  global.fetch = fetch;
}

const t = initTRPC.create({});

const router = t.router;
const publicProcedure = t.procedure;

const posts = [
  {
    id: '1',
    title: 'Hello World',
  },
];
const appRouter = router({
  listPosts: publicProcedure.query(() => posts),
  addPost: publicProcedure
    .input(
      z.object({
        title: z.string(),
      }),
    )
    .mutation((opts) => {
      const id = Math.random().toString();
      posts.push({
        id,
        title: opts.input.title,
      });
      return {
        id,
      };
    }),
  byId: publicProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .query((opts) => {
      const post = posts.find((p) => p.id === opts.input.id);
      if (!post) throw new TRPCError({ code: 'NOT_FOUND' });
      return post;
    }),
});

type AppRouter = typeof appRouter;

function createServer() {
  const app = createHTTPServer({
    router: appRouter,
  });

  const { port } = app.listen(0);

  return {
    port: port!,
    close: () => app.server.close(),
  };
}

test('tinytrpc', async () => {
  const server = createServer();

  const trpc = createTinyRPCClient<AppRouter>(
    `http://localhost:${server.port}`,
  );

  const posts = await trpc.listPosts.query();
  expect(posts).toMatchInlineSnapshot(`
    Array [
      Object {
        "id": "1",
        "title": "Hello World",
      },
    ]
  `);

  const title = 'Hello from test';
  const addedPost = await trpc.addPost.mutate({ title });

  const post = await trpc.byId.query({ id: addedPost.id });
  expect(post).not.toBeFalsy();
  expect(post.title).toBe(title);

  expect(await trpc.listPosts.query()).toHaveLength(posts.length + 1);

  server.close();
});
