import type { AnyRootTypes } from '@trpc/server/unstable-core-do-not-import';
import { createJsonBatchStreamConsumer } from '@trpc/server/unstable-core-do-not-import';
import type { NonEmptyArray } from '../internals/types';
import type { HTTPBatchLinkOptions } from './HTTPBatchLinkOptions';
import type { RequesterFn } from './internals/createHTTPBatchLink';
import { createHTTPBatchLink } from './internals/createHTTPBatchLink';
import { getTextDecoder } from './internals/getTextDecoder';
import type { HTTPResult } from './internals/httpUtils';
import { fetchHTTPResponse, getBody, getUrl } from './internals/httpUtils';
import type { TextDecoderEsque } from './internals/streamingUtils';
import type { Operation } from './types';

export type HTTPBatchStreamLinkOptions<TRoot extends AnyRootTypes> =
  HTTPBatchLinkOptions<TRoot> & {
    /**
     * Will default to the webAPI `TextDecoder`,
     * but you can use this option if your client
     * runtime doesn't provide it.
     */
    textDecoder?: TextDecoderEsque;
  };

const streamRequester: RequesterFn<HTTPBatchStreamLinkOptions<AnyRootTypes>> = (
  requesterOpts,
) => {
  const textDecoder = getTextDecoder(requesterOpts.opts.textDecoder);
  return (batchOps, unitResolver) => {
    const path = batchOps.map((op) => op.path).join(',');
    const inputs = batchOps.map((op) => op.input);

    const ac = requesterOpts.AbortController
      ? new requesterOpts.AbortController()
      : null;
    const responsePromise = fetchHTTPResponse(
      {
        ...requesterOpts,
        TextDecoder: textDecoder,
        contentTypeHeader: 'application/json',
        batchModeHeader: 'stream',
        getUrl,
        getBody,
        inputs,
        path,
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
      ac,
    );

    const result = responsePromise.then(async (res) => {
      if (!res.body) {
        throw new Error('Received response without body');
      }
      const [head, streamMeta] = await createJsonBatchStreamConsumer<
        Record<string, Promise<any>>
      >({
        from: res.body,
        deserialize: requesterOpts.transformer.output.deserialize,
        // onError: console.error,
      });

      await Promise.all(
        Object.keys(batchOps).map(async (key) => {
          const json = await head[key];
          const result: HTTPResult = {
            json,
            meta: {
              response: res,
            },
          };
          unitResolver(Number(key), result);

          return result;
        }),
      );
      return streamMeta.reader.closed;
    });

    return {
      /**
       * return an empty array because the batchLoader expects an array of results
       * but we've already called the `unitResolver` for each of them, there's
       * nothing left to do here.
       */
      promise: result.then(() => []),
      cancel: () => {
        ac?.abort();
      },
    };
  };
};

export const unstable_httpBatchStreamLink =
  createHTTPBatchLink(streamRequester);
