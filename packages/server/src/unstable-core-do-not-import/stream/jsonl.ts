import { isPlainObject } from '@trpc/server/vendor/is-plain-object';
import { isAsyncIterable, isFunction, isObject, run } from '../utils';
import { iteratorResource } from './utils/asyncIterable';
import type { Deferred } from './utils/createDeferred';
import { createDeferred } from './utils/createDeferred';
import { makeResource } from './utils/disposable';
import { mergeAsyncIterables } from './utils/mergeAsyncIterables';
import { readableStreamFrom } from './utils/readableStreamFrom';
import { PING_SYM, withPing } from './utils/withPing';

/**
 * A subset of the standard ReadableStream properties needed by tRPC internally.
 * @see ReadableStream from lib.dom.d.ts
 */
export type WebReadableStreamEsque = {
  getReader: () => ReadableStreamDefaultReader<Uint8Array>;
};

export type NodeJSReadableStreamEsque = {
  on(
    eventName: string | symbol,
    listener: (...args: any[]) => void,
  ): NodeJSReadableStreamEsque;
};

// ---------- types
const CHUNK_VALUE_TYPE_PROMISE = 0;
type CHUNK_VALUE_TYPE_PROMISE = typeof CHUNK_VALUE_TYPE_PROMISE;
const CHUNK_VALUE_TYPE_ASYNC_ITERABLE = 1;
type CHUNK_VALUE_TYPE_ASYNC_ITERABLE = typeof CHUNK_VALUE_TYPE_ASYNC_ITERABLE;

const PROMISE_STATUS_FULFILLED = 0;
type PROMISE_STATUS_FULFILLED = typeof PROMISE_STATUS_FULFILLED;
const PROMISE_STATUS_REJECTED = 1;
type PROMISE_STATUS_REJECTED = typeof PROMISE_STATUS_REJECTED;

const ASYNC_ITERABLE_STATUS_RETURN = 0;
type ASYNC_ITERABLE_STATUS_RETURN = typeof ASYNC_ITERABLE_STATUS_RETURN;
const ASYNC_ITERABLE_STATUS_YIELD = 1;
type ASYNC_ITERABLE_STATUS_YIELD = typeof ASYNC_ITERABLE_STATUS_YIELD;
const ASYNC_ITERABLE_STATUS_ERROR = 2;
type ASYNC_ITERABLE_STATUS_ERROR = typeof ASYNC_ITERABLE_STATUS_ERROR;

type ChunkDefinitionKey =
  // root should be replaced
  | null
  // at array path
  | number
  // at key path
  | string;

type ChunkIndex = number & { __chunkIndex: true };
type ChunkValueType =
  | CHUNK_VALUE_TYPE_PROMISE
  | CHUNK_VALUE_TYPE_ASYNC_ITERABLE;
type ChunkDefinition = [
  key: ChunkDefinitionKey,
  type: ChunkValueType,
  chunkId: ChunkIndex,
];
type EncodedValue = [
  // data
  [unknown] | [],
  // chunk descriptions
  ...ChunkDefinition[],
];

type Head = Record<string, EncodedValue>;
type PromiseChunk =
  | [
      chunkIndex: ChunkIndex,
      status: PROMISE_STATUS_FULFILLED,
      value: EncodedValue,
    ]
  | [chunkIndex: ChunkIndex, status: PROMISE_STATUS_REJECTED, error: unknown];
type IterableChunk =
  | [
      chunkIndex: ChunkIndex,
      status: ASYNC_ITERABLE_STATUS_RETURN,
      value: EncodedValue,
    ]
  | [
      chunkIndex: ChunkIndex,
      status: ASYNC_ITERABLE_STATUS_YIELD,
      value: EncodedValue,
    ]
  | [
      chunkIndex: ChunkIndex,
      status: ASYNC_ITERABLE_STATUS_ERROR,
      error: unknown,
    ];
type ChunkData = PromiseChunk | IterableChunk;
type PlaceholderValue = 0 & { __placeholder: true };
export function isPromise(value: unknown): value is Promise<unknown> {
  return (
    (isObject(value) || isFunction(value)) &&
    typeof value?.['then'] === 'function' &&
    typeof value?.['catch'] === 'function'
  );
}

type Serialize = (value: any) => any;
type Deserialize = (value: any) => any;

type PathArray = readonly (string | number)[];
export type ProducerOnError = (opts: {
  error: unknown;
  path: PathArray;
}) => void;
export interface JSONLProducerOptions {
  serialize?: Serialize;
  data: Record<string, unknown> | unknown[];
  onError?: ProducerOnError;
  formatError?: (opts: { error: unknown; path: PathArray }) => unknown;
  maxDepth?: number;
  /**
   * Interval in milliseconds to send a ping to the client to keep the connection alive
   * This will be sent as a whitespace character
   * @default undefined
   */
  pingMs?: number;
}

class MaxDepthError extends Error {
  constructor(public path: (string | number)[]) {
    super('Max depth reached at path: ' + path.join('.'));
  }
}

async function* createBatchStreamProducer(
  opts: JSONLProducerOptions,
): AsyncIterable<Head | ChunkData | typeof PING_SYM, void> {
  const { data } = opts;
  let counter = 0 as ChunkIndex;
  const placeholder = 0 as PlaceholderValue;

  const mergedIterables = mergeAsyncIterables<ChunkData>();
  function registerAsync(
    callback: (idx: ChunkIndex) => AsyncIterable<ChunkData, void>,
  ) {
    const idx = counter++ as ChunkIndex;

    const iterable = callback(idx);
    mergedIterables.add(iterable);

    return idx;
  }

  function encodePromise(promise: Promise<unknown>, path: (string | number)[]) {
    return registerAsync(async function* (idx) {
      const error = checkMaxDepth(path);
      if (error) {
        // Catch any errors from the original promise to ensure they're reported
        promise.catch((cause) => {
          opts.onError?.({ error: cause, path });
        });
        // Replace the promise with a rejected one containing the max depth error
        promise = Promise.reject(error);
      }
      try {
        const next = await promise;
        yield [idx, PROMISE_STATUS_FULFILLED, encode(next, path)];
      } catch (cause) {
        opts.onError?.({ error: cause, path });
        yield [
          idx,
          PROMISE_STATUS_REJECTED,
          opts.formatError?.({ error: cause, path }),
        ];
      }
    });
  }
  function encodeAsyncIterable(
    iterable: AsyncIterable<unknown>,
    path: (string | number)[],
  ) {
    return registerAsync(async function* (idx) {
      const error = checkMaxDepth(path);
      if (error) {
        throw error;
      }
      await using iterator = iteratorResource(iterable);

      try {
        while (true) {
          const next = await iterator.next();
          if (next.done) {
            yield [idx, ASYNC_ITERABLE_STATUS_RETURN, encode(next.value, path)];
            break;
          }
          yield [idx, ASYNC_ITERABLE_STATUS_YIELD, encode(next.value, path)];
        }
      } catch (cause) {
        opts.onError?.({ error: cause, path });

        yield [
          idx,
          ASYNC_ITERABLE_STATUS_ERROR,
          opts.formatError?.({ error: cause, path }),
        ];
      }
    });
  }
  function checkMaxDepth(path: (string | number)[]) {
    if (opts.maxDepth && path.length > opts.maxDepth) {
      return new MaxDepthError(path);
    }
    return null;
  }
  function encodeAsync(
    value: unknown,
    path: (string | number)[],
  ): null | [type: ChunkValueType, chunkId: ChunkIndex] {
    if (isPromise(value)) {
      return [CHUNK_VALUE_TYPE_PROMISE, encodePromise(value, path)];
    }
    if (isAsyncIterable(value)) {
      if (opts.maxDepth && path.length >= opts.maxDepth) {
        throw new Error('Max depth reached');
      }
      return [
        CHUNK_VALUE_TYPE_ASYNC_ITERABLE,
        encodeAsyncIterable(value, path),
      ];
    }
    return null;
  }
  function encode(value: unknown, path: (string | number)[]): EncodedValue {
    if (value === undefined) {
      return [[]];
    }
    const reg = encodeAsync(value, path);
    if (reg) {
      return [[placeholder], [null, ...reg]];
    }

    if (!isPlainObject(value)) {
      return [[value]];
    }

    const newObj: Record<string, unknown> = {};
    const asyncValues: ChunkDefinition[] = [];
    for (const [key, item] of Object.entries(value)) {
      const transformed = encodeAsync(item, [...path, key]);
      if (!transformed) {
        newObj[key] = item;
        continue;
      }
      newObj[key] = placeholder;
      asyncValues.push([key, ...transformed]);
    }
    return [[newObj], ...asyncValues];
  }

  const newHead: Head = {};
  for (const [key, item] of Object.entries(data)) {
    newHead[key] = encode(item, [key]);
  }

  yield newHead;

  let iterable: AsyncIterable<ChunkData | typeof PING_SYM, void> =
    mergedIterables;
  if (opts.pingMs) {
    iterable = withPing(mergedIterables, opts.pingMs);
  }

  for await (const value of iterable) {
    yield value;
  }
}
/**
 * JSON Lines stream producer
 * @see https://jsonlines.org/
 */
export function jsonlStreamProducer(opts: JSONLProducerOptions) {
  let stream = readableStreamFrom(createBatchStreamProducer(opts));

  const { serialize } = opts;
  if (serialize) {
    stream = stream.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          if (chunk === PING_SYM) {
            controller.enqueue(PING_SYM);
          } else {
            controller.enqueue(serialize(chunk));
          }
        },
      }),
    );
  }

  return stream
    .pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          if (chunk === PING_SYM) {
            controller.enqueue(' ');
          } else {
            controller.enqueue(JSON.stringify(chunk) + '\n');
          }
        },
      }),
    )
    .pipeThrough(new TextEncoderStream());
}

class AsyncError extends Error {
  constructor(public readonly data: unknown) {
    super('Received error from server');
  }
}
export type ConsumerOnError = (opts: { error: unknown }) => void;

const nodeJsStreamToReaderEsque = (source: NodeJSReadableStreamEsque) => {
  return {
    getReader() {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          source.on('data', (chunk) => {
            controller.enqueue(chunk);
          });
          source.on('end', () => {
            controller.close();
          });
          source.on('error', (error) => {
            controller.error(error);
          });
        },
      });
      return stream.getReader();
    },
  };
};

function createLineAccumulator(
  from: NodeJSReadableStreamEsque | WebReadableStreamEsque,
) {
  const reader =
    'getReader' in from
      ? from.getReader()
      : nodeJsStreamToReaderEsque(from).getReader();

  let lineAggregate = '';

  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();

      if (done) {
        controller.close();
      } else {
        controller.enqueue(value);
      }
    },
    cancel() {
      return reader.cancel();
    },
  })
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(
      new TransformStream<string, string>({
        transform(chunk, controller) {
          lineAggregate += chunk;
          const parts = lineAggregate.split('\n');
          lineAggregate = parts.pop() ?? '';
          for (const part of parts) {
            controller.enqueue(part);
          }
        },
      }),
    );
}
function createConsumerStream<THead>(
  from: NodeJSReadableStreamEsque | WebReadableStreamEsque,
) {
  const stream = createLineAccumulator(from);

  let sentHead = false;
  return stream.pipeThrough(
    new TransformStream<string, ChunkData | THead>({
      transform(line, controller) {
        if (!sentHead) {
          const head = JSON.parse(line);
          controller.enqueue(head as THead);
          sentHead = true;
        } else {
          const chunk: ChunkData = JSON.parse(line);
          controller.enqueue(chunk);
        }
      },
    }),
  );
}

/**
 * Creates a handler for managing stream controllers and their lifecycle
 */
function createStreamsManager(abortController: AbortController) {
  const controllerMap = new Map<
    ChunkIndex,
    ReturnType<typeof createStreamController>
  >();

  /**
   * Checks if there are no pending controllers or deferred promises
   */
  function isEmpty() {
    return Array.from(controllerMap.values()).every((c) => c.closed);
  }

  /**
   * Creates a stream controller
   */
  function createStreamController() {
    let originalController: ReadableStreamDefaultController<ChunkData>;
    const stream = new ReadableStream<ChunkData>({
      start(controller) {
        originalController = controller;
      },
    });

    const streamController = {
      enqueue: (v: ChunkData) => originalController.enqueue(v),
      close: () => {
        originalController.close();

        clear();

        if (isEmpty()) {
          abortController.abort();
        }
      },
      closed: false,
      getReaderResource: () => {
        const reader = stream.getReader();

        return makeResource(reader, () => {
          streamController.close();
          reader.releaseLock();
        });
      },
      error: (reason: unknown) => {
        originalController.error(reason);

        clear();
      },
    };
    function clear() {
      Object.assign(streamController, {
        closed: true,
        close: () => {
          // noop
        },
        enqueue: () => {
          // noop
        },
        getReaderResource: null,
        error: () => {
          // noop
        },
      });
    }

    return streamController;
  }

  /**
   * Gets or creates a stream controller
   */
  function getOrCreate(chunkId: ChunkIndex) {
    let c = controllerMap.get(chunkId);
    if (!c) {
      c = createStreamController();
      controllerMap.set(chunkId, c);
    }
    return c;
  }

  /**
   * Cancels all pending controllers and rejects deferred promises
   */
  function cancelAll(reason: unknown) {
    for (const controller of controllerMap.values()) {
      controller.error(reason);
    }
  }

  return {
    getOrCreate,
    cancelAll,
  };
}

/**
 * JSON Lines stream consumer
 * @see https://jsonlines.org/
 */
export async function jsonlStreamConsumer<THead>(opts: {
  from: NodeJSReadableStreamEsque | WebReadableStreamEsque;
  deserialize?: Deserialize;
  onError?: ConsumerOnError;
  formatError?: (opts: { error: unknown }) => Error;
  /**
   * This `AbortController` will be triggered when there are no more listeners to the stream.
   */
  abortController: AbortController;
}) {
  const { deserialize = (v) => v } = opts;

  let source = createConsumerStream<Head>(opts.from);
  if (deserialize) {
    source = source.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          controller.enqueue(deserialize(chunk));
        },
      }),
    );
  }
  let headDeferred: null | Deferred<THead> = createDeferred();

  const streamManager = createStreamsManager(opts.abortController);

  function decodeChunkDefinition(value: ChunkDefinition) {
    const [_path, type, chunkId] = value;

    const controller = streamManager.getOrCreate(chunkId);

    switch (type) {
      case CHUNK_VALUE_TYPE_PROMISE: {
        return run(async () => {
          using reader = controller.getReaderResource();

          const { value } = await reader.read();
          const [_chunkId, status, data] = value as PromiseChunk;
          switch (status) {
            case PROMISE_STATUS_FULFILLED:
              return decode(data);
            case PROMISE_STATUS_REJECTED:
              throw opts.formatError?.({ error: data }) ?? new AsyncError(data);
          }
        });
      }
      case CHUNK_VALUE_TYPE_ASYNC_ITERABLE: {
        return run(async function* () {
          using reader = controller.getReaderResource();

          while (true) {
            const { value } = await reader.read();

            const [_chunkId, status, data] = value as IterableChunk;

            switch (status) {
              case ASYNC_ITERABLE_STATUS_YIELD:
                yield decode(data);
                break;
              case ASYNC_ITERABLE_STATUS_RETURN:
                return decode(data);
              case ASYNC_ITERABLE_STATUS_ERROR:
                throw (
                  opts.formatError?.({ error: data }) ?? new AsyncError(data)
                );
            }
          }
        });
      }
    }
  }

  function decode(value: EncodedValue): unknown {
    const [[data], ...asyncProps] = value;

    for (const value of asyncProps) {
      const [key] = value;
      const decoded = decodeChunkDefinition(value);

      if (key === null) {
        return decoded;
      }

      (data as any)[key] = decoded;
    }
    return data;
  }

  const closeOrAbort = (reason?: unknown) => {
    headDeferred?.reject(reason);
    streamManager.cancelAll(reason);
  };

  source
    .pipeTo(
      new WritableStream({
        write(chunkOrHead) {
          if (headDeferred) {
            const head = chunkOrHead as Record<number | string, unknown>;

            for (const [key, value] of Object.entries(chunkOrHead)) {
              const parsed = decode(value as any);
              head[key] = parsed;
            }
            headDeferred.resolve(head as THead);
            headDeferred = null;

            return;
          }
          const chunk = chunkOrHead as ChunkData;
          const [idx] = chunk;

          const controller = streamManager.getOrCreate(idx);
          controller.enqueue(chunk);
        },
        close: closeOrAbort,
        abort: closeOrAbort,
      }),
    )
    .catch((error) => {
      opts.onError?.({ error });
      closeOrAbort(error);
    });

  return [await headDeferred.promise] as const;
}
