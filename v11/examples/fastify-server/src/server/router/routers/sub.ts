import { observable } from '@trpc/server/observable';
import { publicProcedure, router } from '../trpc';

export const subRouter = router({
  randomNumber: publicProcedure.subscription(() => {
    return observable<{ randomNumber: number }>((emit) => {
      const timer = setInterval(() => {
        emit.next({ randomNumber: Math.random() });
      }, 1000);

      return () => {
        clearInterval(timer);
      };
    });
  }),
});
