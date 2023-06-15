import {
  AnyRouter,
  inferRouterContext,
  inferRouterError,
  ProcedureType,
} from '../core';
import { TRPCResponse } from '../rpc';
import { MaybePromise } from '../types';
import { createBodyFormatter } from './batchStreamFormatter';
import { HTTPHeaders, StreamHTTPResponse } from './internals/types';
import { HTTPBaseHandlerOptions, HTTPRequest } from './types';

const counting = Symbol('COUNTING');

interface AsyncIteratorEsque {
  next(): MaybePromise<{ value: unknown; done?: boolean }>;
}

interface AsyncIterableEsque {
  [Symbol.asyncIterator](): AsyncIteratorEsque;
}

function isAsyncIterableEsque(
  maybeAsyncIterable: unknown,
): maybeAsyncIterable is AsyncIterableEsque {
  return (
    !!maybeAsyncIterable &&
    (typeof maybeAsyncIterable === 'object' ||
      typeof maybeAsyncIterable === 'function') &&
    Symbol.asyncIterator in maybeAsyncIterable
  );
}

function isAsyncIteratorEsque(
  maybeAsyncIterator: unknown,
): maybeAsyncIterator is AsyncIteratorEsque {
  return (
    !!maybeAsyncIterator &&
    (typeof maybeAsyncIterator === 'object' ||
      typeof maybeAsyncIterator === 'function') &&
    typeof (maybeAsyncIterator as any).next === 'function'
  );
}

/**
 * A factory for creating stream generators from an array of response promises.
 * @param promises - An array of promises that will resolve to the responses for each request
 * @param router - The router that handled the request
 * @returns An async generator that yields JSON strings for each response (or response chunk) in a streaming response.
 */
export function buildResponse<
  TRouter extends AnyRouter,
  TRequest extends HTTPRequest,
>(opts: {
  ctx: inferRouterContext<TRouter> | undefined;
  paths: string[] | undefined;
  type: ProcedureType | 'unknown';
  promises: Promise<TRPCResponse<unknown, inferRouterError<TRouter>>>[];
  errors: inferRouterError<TRouter>[];
  router: TRouter;
  streamMode: 'json' | 'sse' | 'none';
  isBatchCall: boolean;
  responseMeta?: HTTPBaseHandlerOptions<TRouter, TRequest>['responseMeta'];
}) {
  const {
    ctx,
    paths,
    type,
    promises,
    router,
    streamMode,
    isBatchCall,
    responseMeta,
  } = opts;

  let style: 'event-stream' | 'json-stream' | 'batch' | 'single';

  if (streamMode === 'none') style = isBatchCall ? 'batch' : 'single';
  else style = streamMode === 'sse' ? 'event-stream' : 'json-stream';

  const head: { status: number; headers: HTTPHeaders } = {
    status: 207,
    headers: {
      'Content-Type':
        style === 'event-stream' ? 'text/event-stream' : 'application/json',
    },
  };

  const body = writeBody();
  const partial = { ...head, body } as StreamHTTPResponse;

  partial.json = Response.prototype.json.bind(partial);
  partial.text = Response.prototype.text.bind(partial);

  return partial;

  function writeBody() {
    const encoder = new TextEncoder();
    let queue: AsyncGenerator<string, void, number> | void;

    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        queue = createBodyGenerator();
        const first = await queue.next();
        if (first.done) return (queue = controller.close()); // empty response
        controller.enqueue(encoder.encode(first.value));
      },
      async pull(controller) {
        if (!queue) return controller.error(new Error('Stream was cancelled'));
        // The next `pull` will not run until this promise resolves
        return queue.next().then(({ done, value }) => {
          if (done) queue = controller.close(); // end of stream
          else controller.enqueue(encoder.encode(value));
        });
      },
      cancel() {
        queue = undefined;
      },
    });

    return body;
  }

  async function* createBodyGenerator(): AsyncGenerator<string, void, number> {
    try {
      const formatOutput = createBodyFormatter({
        style,
        router,
        head,
        onResponseInit: ({ data = [], errors = [] } = {}) => {
          return (
            responseMeta?.({
              data,
              errors,
              ctx,
              paths,
              type,
              eagerGeneration: style.includes('stream'),
            }) ?? {}
          );
        },
      });

      // Map each promise to a tuple of its index and its result so we can resolve them out of order and still
      // associate them with the correct procedure call
      const indexedPromises = new Map(
        promises.map((promise, index) => [
          index,
          promise.then((r) => [index, r] as const),
        ]),
      );

      // Start counting the chunks at the last index of results to avoid key collisions
      let chunkIndex = indexedPromises.size;

      async function getNextPromise() {
        const [index, value] = style.includes('stream')
          ? await Promise.race(indexedPromises.values())
          : await Array.from(indexedPromises.values())[0]!;
        indexedPromises.delete(index);
        return [index, value] as const;
      }

      while (indexedPromises.size > 0) {
        const [index, envelope] = await getNextPromise();
        // The result is an error, so return it as a complete procedure result
        if ('error' in envelope) {
          yield formatOutput(index, envelope);
          continue;
        }

        // If the procedure returned a function assume it's a generator fn and call it to get the generator
        envelope.result.data =
          typeof envelope.result.data === 'function'
            ? envelope.result.data()
            : envelope.result.data;

        // If the data is now an async iterable, call its async iterator method to get the async iterator
        if (isAsyncIterableEsque(envelope.result.data)) {
          envelope.result.data = envelope.result.data[Symbol.asyncIterator]();
        }

        // If we don't have an async iterator at this point, we can't stream it, so just return the result
        if (!isAsyncIteratorEsque(envelope.result.data)) {
          yield formatOutput(index, envelope);
          continue;
        }

        const chunks = getRemainingChunks(envelope.result.data);
        //XXX
        if (style !== 'event-stream' && style !== 'json-stream') {
          // We're not streaming, so we need to resolve the generator and return the complete result
          let done;
          let value;

          while (!done) ({ done, value } = await chunks.next());

          indexedPromises.set(
            index,
            Promise.resolve(value).then((value) => [
              index,
              { ...envelope, ...value },
            ]),
          );
        }

        const chunkPromise = chunks.next();

        /**
         * Requeue a promise that resolves when:
         * - the final result is resolved (resolves with that result)
         * OR
         * - a chunk is resolved and added to the queue (resolves with the unfinished iterator)
         */
        indexedPromises.set(
          index,
          chunkPromise.then(async ({ value, done }) => {
            // The value returned from the iterator is the final result, so add it to the queue to be handled normally
            if (done) return [index, { ...envelope, ...value }];
            // chunk has been resolved, so add it to the queue to be handled normally
            indexedPromises.set(
              chunkIndex,
              Promise.resolve(value.chunk).then((chunk) => [
                chunkIndex++,
                {
                  ...envelope,
                  result: { ...envelope.result, data: chunk },
                  id: index, // Set the id to the procedure's index so we know which procedure the chunk belongs to
                },
              ]),
            );
            return [
              index,
              {
                ...envelope,
                result: { ...envelope.result, data: chunks },
              },
            ];
          }),
        );
        //XXX
      }
      yield formatOutput.end();
    } catch (e) {
      console.error(e);
      throw e;
    }
  }
}
/**
 *
 */
type ChunkIterator = AsyncGenerator<
  { chunk: unknown; index: number },
  { result: { type: 'data'; data: unknown } } | { error: unknown }
>;

type CountableIterableIterator = ChunkIterator & {
  [Symbol.asyncIterator](): CountableIterableIterator;
};

/**
 * Given an async iterator, returns an iterator (wrapped in a promise) that counts the calls to `next`
 * and yields `[index, value]` tuples. This iterator is also an IterableIterator whose `Symbol.asyncIterator`
 * method returns itself - therefore, it is not possible to reset this iterator.
 *
 * This is so we may requeue the paused iterator in the stream without a risk of infinite recursion. The iterator
 * should be consumed in its entirety and subsequently discarded. If this iterator is reused, it will start from
 * the last yielded value, which may not be the first value in the original iterator.
 * @param iterator The async iterator to wrap
 * @returns An async IterableIterator that yields [index, value] tuples
 */
function getRemainingChunks(iterator: AsyncIteratorEsque) {
  // If the iterator is already countable, return it
  if (counting in iterator) return iterator as any as CountableIterableIterator;

  // We haven't seen this iterator before
  const countable = gen();

  return Object.assign(countable, {
    [Symbol.asyncIterator]: () => countable,
    [counting]: true,
  }) as any as CountableIterableIterator;

  async function* gen(): ChunkIterator {
    const source = iterator;
    let count = 0;
    try {
      while (true) {
        const { value: data, done } = await source.next();
        if (done) return { result: { type: 'data', data }, error: undefined };
        yield { chunk: data, index: count++ };
      }
    } catch (e) {
      return { error: e, result: undefined }; // TODO: Handle errors better
    } finally {
      try {
        // We get here if generator's `return` method is called, so exhaust the source and return the final value
        let next;
        do {
          /*noop*/
        } while ((next = await source.next()).done !== true);
        return { result: { type: 'data', data: next.value }, error: undefined };
      } catch (e) {
        return { error: e, result: undefined }; // TODO: Handle errors better
      }
    }
  }
}
