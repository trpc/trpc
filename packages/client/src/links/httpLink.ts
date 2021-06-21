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
        ids: [op.id],
      });
      onDestroy(() => {
        if (!done) {
          done = true;
          prev(TRPCClientError.from(new TRPCAbortError(), { isDone: true }));
          cancel();
        }
      });
      promise
        .then((envelope) => {
          if (!done) {
            done = true;
            prev(transformRPCResponse({ envelope, runtime }));
          }
        })
        .catch((err) => {
          if (!done) {
            done = true;
            prev(TRPCClientError.from(err));
          }
        });
    };
  };
}
