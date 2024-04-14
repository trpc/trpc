import type { AnyRootTypes } from '@trpc/server/unstable-core-do-not-import';
import type { inferClientTypes } from '@trpc/server/unstable-core-do-not-import/clientish/inferrable';
import type { AnyRouter } from '@trpc/server/unstable-core-do-not-import/router';
import type { NonEmptyArray } from '../internals/types';
import type { HTTPBatchLinkOptions } from './HTTPBatchLinkOptions';
import { httpLink } from './httpLink';
import { isNonJsonSerialisable } from './internals/contentTypes';
import type { RequesterFn } from './internals/createHTTPBatchLink';
import { createHTTPBatchLink } from './internals/createHTTPBatchLink';
import { jsonHttpRequester } from './internals/httpUtils';
import { splitLink } from './splitLink';
import type { Operation } from './types';

const batchRequester: RequesterFn<HTTPBatchLinkOptions<AnyRootTypes>> = (
  requesterOpts,
) => {
  return (batchOps) => {
    const path = batchOps.map((op) => op.path).join(',');
    const inputs = batchOps.map((op) => op.input);

    const { promise, cancel } = jsonHttpRequester({
      ...requesterOpts,
      path,
      inputs,
      headers() {
        if (!requesterOpts.opts.headers) {
          return {};
        }
        if (typeof requesterOpts.opts.headers === 'function') {
          return requesterOpts.opts.headers({
            opList: batchOps as NonEmptyArray<Operation>,
          });
        }
        return requesterOpts.opts.headers;
      },
    });

    return {
      promise: promise.then((res) => {
        const resJSON = Array.isArray(res.json)
          ? res.json
          : batchOps.map(() => res.json);

        const result = resJSON.map((item) => ({
          meta: res.meta,
          json: item,
        }));

        return result;
      }),
      cancel,
    };
  };
};

export const httpJsonBatchLink = createHTTPBatchLink(batchRequester);

export function httpBatchLink<TRouter extends AnyRouter>(
  opts: HTTPBatchLinkOptions<inferClientTypes<TRouter>>,
) {
  return splitLink({
    condition: (op) => isNonJsonSerialisable(op.input),
    true: httpLink<TRouter>({
      ...opts,
      headers(req) {
        if (!opts.headers) {
          return {};
        }

        if (typeof opts.headers === 'function') {
          return opts.headers({
            opList: [req.op],
          });
        }

        return opts.headers;
      },
    }),
    false: httpJsonBatchLink(opts),
  });
}
