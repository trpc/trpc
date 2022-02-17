import { createRouter } from './createRouter';
import { postsRouter } from './routers/posts';
import { subRouter } from './routers/sub';
import { apiRouter } from './routers/api';

export const appRouter = createRouter()
  .merge('posts:', postsRouter)
  .merge('sub:', subRouter)
  .merge(apiRouter);

export type AppRouter = typeof appRouter;
