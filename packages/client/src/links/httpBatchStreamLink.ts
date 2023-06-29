import { NonEmptyArray } from '../internals/types';
import { HTTPBatchStreamLinkOptions } from './HTTPBatchStreamLinkOptions';
import {
  createHTTPBatchLink,
  RequesterFn,
} from './internals/createHTTPBatchLink';
import { getTextDecoder } from './internals/getTextDecoder';
import { streamingJsonHttpRequester } from './internals/parseJSONStream';
import { Operation } from './types';

const streamRequester: RequesterFn<HTTPBatchStreamLinkOptions> = (
  requesterOpts,
) => {
  const textDecoder = getTextDecoder(requesterOpts.opts.textDecoder);
  return (batchOps, unitResolver) => {
    const path = batchOps.map((op) => op.path).join(',');
    const inputs = batchOps.map((op) => op.input);

    const { cancel, promise } = streamingJsonHttpRequester(
      {
        ...requesterOpts,
        textDecoder,
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
      },
      (index, res) => {
        unitResolver(index, res);
      },
    );

    return {
      /**
       * return an empty array because the batchLoader expects an array of results
       * but we've already called the `unitResolver` for each of them, there's
       * nothing left to do here.
       */
      promise: promise.then(() => []),
      cancel,
    };
  };
};

export const unstable_httpBatchStreamLink =
  createHTTPBatchLink(streamRequester);
