import { AnyRouter } from '@trpc/server';
import { getFetch } from '../getFetch';
import { TRPCClientError } from '../TRPCClientError';
import { TRPCAbortError } from '../internals/TRPCAbortError';
import { getAbortController } from '../internals/fetchHelpers';
import { httpRequest } from '../internals/httpRequest';
import { transformRPCResponse } from '../internals/transformRPCResponse';
import { HTTPHeaders, HTTPLinkBaseOptions, Operation, TRPCLink } from './core';

type GetHeadersFn = (opts: {
  op: Operation<unknown>;
}) => HTTPHeaders | Promise<HTTPHeaders>;

interface HTTPLinkOptions extends HTTPLinkBaseOptions {
  headers?: HTTPHeaders | GetHeadersFn;
}

export function httpLink<TRouter extends AnyRouter>(
  opts: HTTPLinkOptions,
): TRPCLink<TRouter> {
  const { url } = opts;

  // initialized config
  return (runtime) => {
    // initialized in app

    const getHeaders: GetHeadersFn = async (arg1) => {
      const val = opts.headers;
      return {
        ...(await runtime.headers()),
        ...(typeof val === 'function' ? await val(arg1) : val),
      };
    };

    return ({ op, prev, onDestroy }) => {
      const { path, input, type } = op;
      const { promise, cancel } = httpRequest({
        type,
        input,
        url,
        path,
        transformer: runtime.transformer,
        fetch: getFetch(opts.fetch ?? runtime.fetch),
        AbortController: getAbortController(
          opts.AbortController ?? runtime.AbortController,
        ),
        headers: () => getHeaders({ op }),
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
