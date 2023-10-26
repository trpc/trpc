/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { TRPCResponse } from '@trpc/server/rpc';
import { unstable_createTsonAsyncOptions } from '@trpc/server/shared';
import { createTsonParseJsonStreamResponse, TsonAsyncOptions } from 'tupleson';
import { NonEmptyArray } from '../internals/types';
import { HTTPBatchLinkOptions } from './HTTPBatchLinkOptions';
import {
  createHTTPBatchLink,
  RequesterFn,
} from './internals/createHTTPBatchLink';
// Stream parsing adapted from https://www.loginradius.com/blog/engineering/guest-post/http-streaming-with-nodejs-and-fetch-api/
import {
  fetchHTTPResponse,
  getBody,
  getUrl,
  HTTPResult,
} from './internals/httpUtils';
import { Operation } from './types';

export interface HTTPTuplesonLinkOptions extends HTTPBatchLinkOptions {
  tuplesonOptions?: Partial<TsonAsyncOptions>;
}

const tuplesonRequester: RequesterFn<HTTPTuplesonLinkOptions> = (
  requesterOpts,
) => {
  const tuplesonOpts = unstable_createTsonAsyncOptions(
    requesterOpts.opts.tuplesonOptions,
  );
  return (batchOps, unitResolver) => {
    // do a request
    const deserializeResponse = createTsonParseJsonStreamResponse(tuplesonOpts);
    const path = batchOps.map((op) => op.path).join(',');
    const inputs = batchOps.map((op) => op.input);

    const ac = requesterOpts.AbortController
      ? new requesterOpts.AbortController()
      : null;
    const responsePromise = fetchHTTPResponse(
      {
        ...requesterOpts,
        contentTypeHeader: 'application/json',
        batchModeHeader: 'tupleson-json',
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
    const cancel = () => ac?.abort();
    const promise = responsePromise.then(async (res) => {
      const output = await deserializeResponse<Promise<TRPCResponse>[]>(
        res as Response,
      );
      const meta: HTTPResult['meta'] = {
        response: res,
      };

      for (const [index, promise] of output.entries()) {
        promise
          .then((json) => {
            unitResolver(index, {
              meta,
              json,
            });
          })
          .catch((err) => {
            throw err;
          });
      }

      return Promise.allSettled(output);
    });

    return {
      cancel,

      /**
       * return an empty array because the batchLoader expects an array of results
       * but we've already called the `unitResolver` for each of them, there's
       * nothing left to do here.
       */
      promise: promise.then(() => []),
    };
  };
};

export const experimental_httpTuplesonLink =
  createHTTPBatchLink(tuplesonRequester);
