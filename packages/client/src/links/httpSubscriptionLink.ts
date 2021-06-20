import { AnyRouter } from '@trpc/server';
import { HttpLinkOptions, TRPCLink } from './core';

export function httpSubscriptionLink<TRouter extends AnyRouter>(
  opts: HttpLinkOptions,
): TRPCLink<TRouter> {
  // initialized config
  return () => {
    // initialized in app
    return ({ op, prev, next }) => {
      next(op, (res) => {
        prev(res);
      });
    };
  };
}
