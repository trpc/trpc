import { HttpLinkOptions, TRPCLink } from './core';
import { httpRequest } from '../internals/httpRequest';
import { AnyRouter } from '@trpc/server/router';

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
      onDestroy(() => cancel());
      promise.then(prev).catch(prev);
    };
  };
}
