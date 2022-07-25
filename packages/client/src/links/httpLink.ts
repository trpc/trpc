import { AnyRouter } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { HTTPLinkOptions, httpRequest } from './internals/httpUtils';
import { transformOperationResult } from './internals/transformOperationResult';
import { OperationResult, TRPCLink } from './types';

export function httpLink<TRouter extends AnyRouter>(
  opts: HTTPLinkOptions,
): TRPCLink<TRouter> {
  const { url } = opts;
  return (runtime) =>
    ({ op }) =>
      observable((observer) => {
        const { path, input, type } = op;
        const { promise, cancel } = httpRequest({
          url,
          runtime,
          type,
          path,
          input,
        });
        promise
          .then((res) => {
            const result = {
              context: res.meta,
              data: res.json,
            } as OperationResult<TRouter, any>;
            const transformed = transformOperationResult(result, runtime);
            if (transformed.ok) {
              observer.next({
                context: res.meta,
                data: res.json as any,
              });
            } else {
              observer.error(transformed.error);
            }
            observer.complete();
          })
          .catch((err) => observer.error(err as any));

        return () => {
          cancel();
        };
      });
}
