import { Subscription } from '@trpc/server';
import { createRouter } from '../createRouter';

export const subRouter = createRouter().subscription('randomNumber', {
  resolve() {
    return new Subscription<{ randomNumber: number }>((emit) => {
      const timer = setInterval(() => {
        emit.data({ randomNumber: Math.random() });
      }, 1000);

      return () => {
        clearInterval(timer);
      };
    });
  },
});
