import { lazy, mergeRouters } from '@trpc12/trpc/server';
import { authRouter } from './routers/auth.ts';
import { projectsRouter } from './routers/projects.ts';
import { tasksRouter } from './routers/tasks.ts';

export const appRouter = mergeRouters(authRouter, projectsRouter, tasksRouter, {
  admin: lazy(() => import('./routers/admin.ts')),
});
export type AppRouter = typeof appRouter;
