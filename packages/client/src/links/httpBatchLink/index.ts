import { NonEmptyArray } from '../../internals/types';
import { jsonHttpRequester } from '../internals/httpUtils';
import { Operation } from '../types';
import { makeHttpBatchLink, RequesterFn } from './genericMakeBatchLink';

const batchRequester: RequesterFn = (requesterOpts) => {
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

export const httpBatchLink = makeHttpBatchLink(batchRequester);
