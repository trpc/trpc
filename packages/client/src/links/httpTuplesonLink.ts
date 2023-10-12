import { NonEmptyArray } from '../internals/types';
import { HTTPBatchLinkOptions } from './HTTPBatchLinkOptions';
import {
  createHTTPBatchLink,
  RequesterFn,
} from './internals/createHTTPBatchLink';
import { getTextDecoder } from './internals/getTextDecoder';
// Stream parsing adapted from https://www.loginradius.com/blog/engineering/guest-post/http-streaming-with-nodejs-and-fetch-api/
import {
  fetchHTTPResponse,
  getBody,
  getUrl,
  HTTPBaseRequestOptions,
} from './internals/httpUtils';
import { TextDecoderEsque } from './internals/streamingUtils';
import { HTTPHeaders, Operation } from './types';

export interface HTTPBatchStreamLinkOptions extends HTTPBatchLinkOptions {
  /**
   * Will default to the webAPI `TextDecoder`,
   * but you can use this option if your client
   * runtime doesn't provide it.
   */
  textDecoder?: TextDecoderEsque;
}

const streamingJsonHttpRequester = (
  opts: HTTPBaseRequestOptions & {
    headers: () => HTTPHeaders | Promise<HTTPHeaders>;
    textDecoder: TextDecoderEsque;
  },
) => {
  const ac = opts.AbortController ? new opts.AbortController() : null;
  const responsePromise = fetchHTTPResponse(
    {
      ...opts,
      contentTypeHeader: 'application/json',
      batchModeHeader: 'stream',
      getUrl,
      getBody,
    },
    ac,
  );
  const cancel = () => ac?.abort();
  const promise = responsePromise.then(async (res) => {
    // FIXME
  });

  return { cancel, promise };
};

const streamRequester: RequesterFn<HTTPBatchStreamLinkOptions> = (
  requesterOpts,
) => {
  const textDecoder = getTextDecoder(requesterOpts.opts.textDecoder);
  return (batchOps) => {
    const path = batchOps.map((op) => op.path).join(',');
    const inputs = batchOps.map((op) => op.input);

    const { cancel, promise } = streamingJsonHttpRequester({
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
    });

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

export const unstable_httpTuplesonLink = createHTTPBatchLink(streamRequester);
