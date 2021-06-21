import { AnyRouter } from '@trpc/server';
import { TRPCClientError } from '../TRPCClientError';
import { transformRPCResponse } from '../internals/transformRPCResponse';
import { httpRequest } from '../internals/httpRequest';
import { HttpLinkOptions, TRPCLink } from './core';
import { TRPCAbortError } from '../internals/TRPCAbortErrorSignal';

export function httpLink<TRouter extends AnyRouter>(
  opts: HttpLinkOptions,
): TRPCLink<TRouter> {
  const { url } = opts;

  // initialized config
  return (runtime) => {
    // initialized in app
    return ({ op, prev, onDestroy }) => {
      const { path, input, type } = op;
      let done = false;
      const { promise, cancel } = httpRequest({
        runtime,
        type,
        input,
        url,
        path,
      });
      onDestroy(() => {
        if (!done) {
          prev(TRPCClientError.from(new TRPCAbortError(), { isDone: true }));
          done = true;
          cancel();
        }
      });
      promise
        .then(
          (envelope) =>
            !done && prev(transformRPCResponse({ envelope, runtime })),
        )
        .catch((err) => !done && prev(TRPCClientError.from(err)))
        .finally(() => {
          done = true;
        });
    };
  };
}
