import { AnyRouter } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import {
  HTTPLinkOptions,
  HTTP_METHOD_UNDEFINED_ERROR_MESSAGE,
  HTTP_SUBSCRIPTION_UNSUPPORTED_ERROR_MESSAGE,
  httpRequest,
} from './internals/httpUtils';
import { TRPCLink } from './types';

export function httpLink<TRouter extends AnyRouter>(
  opts: HTTPLinkOptions,
): TRPCLink<TRouter> {
  const { url } = opts;
  return (runtime) =>
    ({ op }) =>
      observable((observer) => {
        const { path, input, type, method } = op;
        if (type === 'subscription') {
          throw new Error(HTTP_SUBSCRIPTION_UNSUPPORTED_ERROR_MESSAGE);
        }
        if (!method) {
          // this should never happen
          throw new Error(HTTP_METHOD_UNDEFINED_ERROR_MESSAGE);
        }

        const { promise, cancel } = httpRequest({
          url,
          runtime,
          type,
          method,
          path,
          input,
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
