import { apiRouter } from './routers/api';
import { postsRouter } from './routers/posts';
import { subRouter } from './routers/sub';
import { t } from './trpc';

export const appRouter = t.router({
  posts: postsRouter,
  sub: subRouter,
  api: apiRouter,
});

export type AppRouter = typeof appRouter;
