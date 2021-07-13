import { AnyRouter } from '@trpc/server';
import { TRPCClientError } from '../TRPCClientError';
import { transformRPCResponse } from '../internals/transformRPCResponse';
import { httpRequest } from '../internals/httpRequest';
import { HttpLinkOptions, TRPCLink } from './core';
import { TRPCAbortError } from '../internals/TRPCAbortError';

export function httpLink<TRouter extends AnyRouter>(
  opts: HttpLinkOptions,
): TRPCLink<TRouter> {
  const { url } = opts;

  // initialized config
  return (runtime) => {
    // initialized in app
    return ({ op, prev, onDestroy }) => {
      const { path, input, type } = op;
      let isDone = false;
      const { promise, cancel } = httpRequest({
        runtime,
        type,
        input,
        url,
        path,
      });
      onDestroy(() => {
        if (!isDone) {
          isDone = true;
          prev(TRPCClientError.from(new TRPCAbortError(), { isDone: true }));
          cancel();
        }
      });
      promise
        .then((envelope) => {
          if (!isDone) {
            isDone = true;
            prev(transformRPCResponse({ envelope, runtime }));
          }
        })
        .catch((err) => {
          if (!isDone) {
            isDone = true;
            prev(TRPCClientError.from(err));
          }
        });
    };
  };
}
