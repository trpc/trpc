import { AnyRouter } from '@trpc/server';
import { TRPCClientError } from '../createTRPCClient';
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
      const { promise, cancel } = httpRequest<TRouter>({
        runtime,
        type,
        input,
        url,
        path,
      });
      onDestroy(() => cancel());
      promise
        .then((v) => prev(v.ok ? v : TRPCClientError.from(v)))
        .catch((err) => TRPCClientError.from(err));
    };
  };
}
