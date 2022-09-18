import { AnyRouter } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { TRPCClientError } from '../TRPCClientError';
import {
  HTTPLinkOptions,
  httpRequest,
  resolveHTTPLinkOptions,
} from './internals/httpUtils';
import { transformResult } from './internals/transformResult';
import { TRPCLink } from './types';

export function httpLink<TRouter extends AnyRouter>(
  opts: HTTPLinkOptions,
): TRPCLink<TRouter> {
  const resolvedOpts = resolveHTTPLinkOptions(opts);
  return (runtime) =>
    ({ op }) =>
      observable((observer) => {
        const { path, input, type } = op;
        const { promise, cancel } = httpRequest({
          ...resolvedOpts,
          runtime,
          type,
          path,
          input,
        });
        promise
          .then((res) => {
            const transformed = transformResult(res.json, runtime);

            if (!transformed.ok) {
              observer.error(
                TRPCClientError.from(transformed.error, {
                  meta: res.meta,
                }),
              );
              return;
            }
            observer.next({
              context: res.meta,
              result: transformed.result,
            });
            observer.complete();
          })
          .catch((cause) => observer.error(TRPCClientError.from(cause)));

        return () => {
          cancel();
        };
      });
}
