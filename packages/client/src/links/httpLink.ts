import { AnyRouter } from '@trpc/server';
import { TRPCClientError } from '../TRPCClientError';
import { transformRPCResponse } from '../internals/transformRPCResponse';
import { httpRequest } from '../internals/httpRequest';
import { HttpLinkOptions, TRPCLink } from './core';

export function httpLink<TRouter extends AnyRouter>(
  opts: HttpLinkOptions,
): TRPCLink<TRouter> {
  const { url } = opts;

  // initialized config
  return (runtime) => {
    // initialized in app
    return ({ op, prev, onDestroy }) => {
      const { path, input, type } = op;
      const { promise, cancel } = httpRequest({
        runtime,
        type,
        input,
        url,
        path,
      });
      onDestroy(() => {
        cancel();
      });
      promise
        .then((envelope) => prev(transformRPCResponse({ envelope, runtime })))
        .catch((err) => prev(TRPCClientError.from(err)));
    };
  };
}
