import { TRPCLink } from './core';

export function retryLink(opts: { attempts: number }): TRPCLink {
  // initialized config
  return () => {
    // initialized in app
    return ({ op, next, prev }) => {
      // initialized for request
      let attempts = 0;
      const fn = () => {
        attempts++;
        next(op, (result) => {
          if (result.ok) {
            prev(result);
          } else {
            attempts < opts.attempts ? fn() : prev(result);
          }
        });
      };
      fn();
    };
  };
}
