import { baseProcedure, router } from '../trpc';
import { todoRouter } from './todo';

export const appRouter = router({
  todo: todoRouter,

  i18n: baseProcedure.query(({ ctx }) => ({
    i18n: ctx.i18n,
    locale: ctx.locale,
  })),
});

export type AppRouter = typeof appRouter;
