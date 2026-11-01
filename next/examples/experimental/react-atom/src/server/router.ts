import { initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';

export interface Post {
  id: string;
  title: string;
  createdAt: Date;
}

const t = initTrpc();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const posts: Post[] = [
  { id: '1', title: 'Read with Effect atoms', createdAt: new Date(0) },
];

export const appRouter = t.router({
  post: {
    list: t.procedure.query(async () => {
      await sleep(50);
      return posts;
    }),
    add: t.procedure
      .input(z.object({ title: z.string().trim().min(1) }))
      .mutation((opts) => {
        const post: Post = {
          id: String(posts.length + 1),
          title: opts.input.title,
          createdAt: new Date(),
        };
        posts.push(post);
        return post;
      }),
  },
  clock: t.procedure.subscription(async function* () {
    for (let tick = 1; ; tick++) {
      yield { tick, at: new Date() };
      await sleep(250);
    }
  }),
});
export type AppRouter = typeof appRouter;
