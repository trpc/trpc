import { observable } from '@trpc/server/observable';
import { createRouter } from '../createRouter';

export const subRouter = createRouter().subscription('randomNumber', {
  resolve() {
    return observable<{ randomNumber: number }>((emit) => {
      const timer = setInterval(() => {
        emit.next({ randomNumber: Math.random() });
      }, 1000);

      return () => {
        clearInterval(timer);
      };
    });
  },
});
