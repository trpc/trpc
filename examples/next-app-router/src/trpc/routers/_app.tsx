import { createTRPCRouter } from '../init';
import { postRouter } from './post';

/**
 * This is the primary router for your server.
 *
 * All routers added in /routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  post: postRouter,
});
export type AppRouter = typeof appRouter;
