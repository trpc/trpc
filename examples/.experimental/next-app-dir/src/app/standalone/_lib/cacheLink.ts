import type { TRPCLink, TRPCLinkDecoratorObject } from '@trpc/client';
import type { AnyTRPCRouter } from '@trpc/server';
import { observable, tap } from '@trpc/server/observable';

type CacheLinkDecorator = TRPCLinkDecoratorObject<{
  query: {
    /**
     * If true, the cache will be ignored and the request will be made as if it was the first time
     */
    ignoreCache: boolean;
  };
}>;

/**
 * @link https://trpc.io/docs/v11/client/links/cacheLink
 */
export function cacheLink<TRouter extends AnyTRPCRouter>(
  // eslint-disable-next-line @typescript-eslint/ban-types
  _opts: {} = {},
): TRPCLink<TRouter, CacheLinkDecorator> {
  return () => {
    return ({ op, next }) => {
      return observable((observer) => {
        return next(op)
          .pipe(
            tap({
              next(result) {
                // logResult(result);
              },
              error(result) {
                // logResult(result);
              },
            }),
          )
          .subscribe(observer);
      });
    };
  };
}

/**
 * @link https://trpc.io/docs/v11/client/links/loggerLink
 */
export function testDecorationLink<TRouter extends AnyTRPCRouter>(
  // eslint-disable-next-line @typescript-eslint/ban-types
  _opts: {} = {},
): TRPCLink<
  TRouter,
  TRPCLinkDecoratorObject<{
    mutation: {
      foo: string;
    };
  }>
> {
  return () => {
    return (opts) => {
      return observable((observer) => {
        return opts
          .next(opts.op)
          .pipe(
            tap({
              next(result) {
                // logResult(result);
              },
              error(result) {
                // logResult(result);
              },
            }),
          )
          .subscribe(observer);
      });
    };
  };
}
