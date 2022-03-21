import { createRouter } from './createRouter';
import { apiRouter } from './routers/api';
import { postsRouter } from './routers/posts';
import { subRouter } from './routers/sub';

export const appRouter = createRouter()
  .merge('posts:', postsRouter)
  .merge('sub:', subRouter)
  .merge(apiRouter);

export type AppRouter = typeof appRouter;
