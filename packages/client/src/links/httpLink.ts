import { AnyRouter } from '@trpc/server';
import { observable } from '../observable/observable';
import { TRPCLink } from './types';
import { HTTPLinkOptions, httpRequest } from './httpUtils';

export function httpLink<TRouter extends AnyRouter>(
  opts: HTTPLinkOptions,
): TRPCLink<TRouter> {
  const { url } = opts;
  return (runtime) =>
    ({ op }) =>
      observable((observer) => {
        const { path, input, type } = op;
        const { promise, cancel } = httpRequest({
          runtime,
          path,
          input,
          type,
          url,
        });
        promise
          .then((res) => {
            observer.next({
              context: res.meta,
              data: res.json as any,
            });
            observer.complete();
          })
          .catch(observer.error);

        return () => {
          cancel();
        };
      });
}
