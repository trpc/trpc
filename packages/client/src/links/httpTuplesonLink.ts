/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { TRPCResponse } from '@trpc/server/rpc';
import { unstable_createTsonAsyncOptions } from '@trpc/server/shared';
import { createTsonParseAsync, TsonAsyncOptions } from 'tupleson';
import { NonEmptyArray, WebReadableStreamEsque } from '../internals/types';
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
  HTTPResult,
} from './internals/httpUtils';
import { TextDecoderEsque } from './internals/streamingUtils';
import { Operation } from './types';

export interface HTTPTuplesonLinkOptions extends HTTPBatchLinkOptions {
  /**
   * Will default to the webAPI `TextDecoder`,
   * but you can use this option if your client
   * runtime doesn't provide it.
   */
  textDecoder?: TextDecoderEsque;
  tuplesonOptions?: Partial<TsonAsyncOptions>;
}

export function createDeferred<TValue>() {
  type PromiseResolve = (value: TValue) => void;
  type PromiseReject = (reason: unknown) => void;
  const deferred = {} as {
    promise: Promise<TValue>;
    reject: PromiseReject;
    resolve: PromiseResolve;
  };
  deferred.promise = new Promise<TValue>((resolve, reject) => {
    deferred.resolve = resolve;
    deferred.reject = reject;
  });
  return deferred;
}

async function* readableStreamToAsyncIterable(
  stream:
    | ReadableStream<unknown>
    | NodeJS.ReadableStream
    | WebReadableStreamEsque,
): AsyncIterable<unknown> {
  if (!('getReader' in stream)) {
    for await (const chunk of stream) {
      yield chunk;
    }
    return;
  }

  // Get a lock on the stream
  const reader = stream.getReader();

  try {
    while (true) {
      // Read from the stream
      const result = await reader.read();

      // Exit if we're done
      if (result.done) {
        return;
      }

      // Else yield the chunk
      yield result.value;
    }
  } finally {
    reader.releaseLock();
  }
}

async function* mapIterable<TFrom, TTo>(
  iterable: AsyncIterable<TFrom>,
  fn: (v: TFrom) => TTo,
): AsyncIterable<TTo> {
  for await (const value of iterable) {
    yield fn(value);
  }
}

const tuplesonRequester: RequesterFn<HTTPTuplesonLinkOptions> = (
  requesterOpts,
) => {
  const textDecoder = getTextDecoder(requesterOpts.opts.textDecoder);
  const tuplesonOpts = unstable_createTsonAsyncOptions(
    requesterOpts.opts.tuplesonOptions,
  );
  return (batchOps, unitResolver) => {
    // do a request
    const parseAsync = createTsonParseAsync(tuplesonOpts);
    const path = batchOps.map((op) => op.path).join(',');
    const inputs = batchOps.map((op) => op.input);

    const ac = requesterOpts.AbortController
      ? new requesterOpts.AbortController()
      : null;
    const responsePromise = fetchHTTPResponse(
      {
        ...requesterOpts,
        contentTypeHeader: 'application/json',
        batchModeHeader: 'tupleson',
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
      const stringIterator = mapIterable(
        readableStreamToAsyncIterable(res.body!),
        (v) => textDecoder.decode(v as any),
      );

      const output = await parseAsync<Promise<TRPCResponse>[]>(stringIterator);
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
