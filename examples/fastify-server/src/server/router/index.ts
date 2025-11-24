import { apiRouter } from './routers/api.ts';
import { postsRouter } from './routers/posts.ts';
import { subRouter } from './routers/sub.ts';
import { router } from './trpc.ts';

export const appRouter = router({
  posts: postsRouter,
  sub: subRouter,
  api: apiRouter,
});

export type AppRouter = typeof appRouter;
