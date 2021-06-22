import { AnyRouter } from '@trpc/server';
import { TRPCLink } from './core';

export function retryLink<TRouter extends AnyRouter = AnyRouter>(opts: {
  attempts: number;
}): TRPCLink<TRouter> {
  // initialized config
  return () => {
    // initialized in app
    return ({ op, next, prev }) => {
      // initialized for request
      let attempts = 0;
      const fn = () => {
        attempts++;
        next(op, (result) => {
          if (result instanceof Error) {
            attempts < opts.attempts ? fn() : prev(result);
          } else {
            prev(result);
          }
        });
      };
      fn();
    };
  };
}
