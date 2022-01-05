import { AnyRouter } from '@trpc/server';
import { observable } from '../rx/observable';
import { HTTPLinkOptions, TRPCLink } from './core';

const METHODS = {
  query: 'GET',
  mutation: 'POST',
  subscription: 'PATCH',
} as const;
export function httpLink<TRouter extends AnyRouter>(
  opts: HTTPLinkOptions,
): TRPCLink<TRouter> {
  return (rt) =>
    ({ op }) =>
      observable((observer) => {
        const ac = rt.AbortController ? new rt.AbortController() : null;
        const stringifiedInput =
          typeof op.input !== 'undefined'
            ? JSON.stringify(op.input)
            : undefined;

        const method = METHODS[op.type];

        const url =
          method === 'GET'
            ? opts.url +
              (stringifiedInput
                ? `?${encodeURIComponent(stringifiedInput)}`
                : '')
            : opts.url;
        const body = method !== 'GET' ? stringifiedInput : undefined;
        let response: Response;

        Promise.resolve(rt.headers())
          .then((headers) =>
            rt.fetch(url, {
              method,
              body,
              signal: ac?.signal,
              headers: {
                'content-type': 'application/json',
                ...headers,
              },
            }),
          )
          .then((_res) => {
            response = _res;
            return response.json();
          })
          .then((json) => {
            observer.next({
              data: json,
              meta: {
                response,
              },
            });
          })
          .catch((err) => {
            observer.error(err as any);
          })
          .finally(() => {
            observer.complete();
          });

        return () => {
          ac?.abort();
        };
      });
}
