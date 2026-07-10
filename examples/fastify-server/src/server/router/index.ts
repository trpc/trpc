import { apiRouter } from './routers/api';
import { postsRouter } from './routers/posts';
import { subRouter } from './routers/sub';
import { router } from './trpc';

export const appRouter = router({
  posts: postsRouter,
  sub: subRouter,
  api: apiRouter,
});

export type AppRouter = typeof appRouter;
