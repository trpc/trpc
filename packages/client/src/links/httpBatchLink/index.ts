import { NonEmptyArray } from '../../internals/types';
import { jsonHttpRequester } from '../internals/httpUtils';
import { Operation } from '../types';
import { RequesterFn, makeHttpBatchLink } from './genericMakeBatchLink';

const batchRequester: RequesterFn = (resolvedOpts, runtime, type, opts) => {
  return (batchOps) => {
    const path = batchOps.map((op) => op.path).join(',');
    const inputs = batchOps.map((op) => op.input);

    const { promise, cancel } = jsonHttpRequester({
      ...resolvedOpts,
      runtime,
      type,
      path,
      inputs,
      headers() {
        if (!opts.headers) {
          return {};
        }
        if (typeof opts.headers === 'function') {
          return opts.headers({
            opList: batchOps as NonEmptyArray<Operation>,
          });
        }
        return opts.headers;
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

export const httpBatchLink = makeHttpBatchLink(batchRequester);
