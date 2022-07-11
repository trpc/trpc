import { observable } from '@trpc/server/observable';
import { t } from '../trpc';

export const subRouter = t.router({
  randomNumber: t.procedure.subscription(() => {
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
