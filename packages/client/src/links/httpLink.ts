import { AnyRouter } from '@trpc/server';
import { TRPCClientError } from '../TRPCClientError';
import { TRPCAbortError } from '../internals/TRPCAbortError';
import { httpRequest } from '../internals/httpRequest';
import { transformRPCResponse } from '../internals/transformRPCResponse';
import { HTTPLinkOptions, TRPCLink } from './core';

export function httpLink<TRouter extends AnyRouter>(
  opts: HTTPLinkOptions,
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
      let isDone = false;
      const prevOnce: typeof prev = (result) => {
        if (isDone) {
          return;
        }
        isDone = true;
        prev(result);
      };
      onDestroy(() => {
        prevOnce(TRPCClientError.from(new TRPCAbortError(), { isDone: true }));
        cancel();
      });
      promise
        .then((envelope) => {
          prevOnce(transformRPCResponse({ envelope, runtime }));
        })
        .catch((cause) => {
          prevOnce(TRPCClientError.from(cause));
        });
    };
  };
}
