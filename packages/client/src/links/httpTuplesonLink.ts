import { unstable_createTsonAsyncOptions } from '@trpc/server/shared';
import { createTsonParseAsync, TsonAsyncOptions } from 'tupleson';
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

export interface HTTPTuplesonLinkOptions extends HTTPBatchLinkOptions {
  /**
   * Will default to the webAPI `TextDecoder`,
   * but you can use this option if your client
   * runtime doesn't provide it.
   */
  textDecoder?: TextDecoderEsque;
  tuplesonOptions?: Partial<TsonAsyncOptions>;
}

async function* readableStreamToAsyncIterable<T>(
  stream: ReadableStream<T>,
): AsyncIterable<T> {
  // Get a lock on the stream
  const reader = stream.getReader();

  try {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
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

async function* mapIterable<T, TValue>(
  iterable: AsyncIterable<T>,
  fn: (v: T) => TValue,
): AsyncIterable<TValue> {
  for await (const value of iterable) {
    yield fn(value);
  }
}

const streamingJsonHttpRequester = (
  opts: HTTPBaseRequestOptions & {
    headers: () => HTTPHeaders | Promise<HTTPHeaders>;
    textDecoder: TextDecoderEsque;
    parseAsync: ReturnType<typeof createTsonParseAsync>;
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
  const textDecoder = new TextDecoder();
  const promise = responsePromise.then(async (res) => {
    const stringIterator = mapIterable(
      readableStreamToAsyncIterable(res.body as any),
      (v) => textDecoder.decode(v as any),
    );

    type FIXME = any;

    const output = await opts.parseAsync<FIXME>(stringIterator);

    console.log({ output });

    // FIXME
  });

  return { cancel, promise };
};

const streamRequester: RequesterFn<HTTPTuplesonLinkOptions> = (
  requesterOpts,
) => {
  const textDecoder = getTextDecoder(requesterOpts.opts.textDecoder);
  const tuplesonOpts = unstable_createTsonAsyncOptions(
    requesterOpts.opts.tuplesonOptions,
  );
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
      parseAsync: createTsonParseAsync(tuplesonOpts),
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
