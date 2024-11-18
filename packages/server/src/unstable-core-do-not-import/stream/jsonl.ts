import { isAsyncIterable, isFunction, isObject, run } from '../utils';
import type { Deferred } from './utils/createDeferred';
import { createDeferred } from './utils/createDeferred';
import { createReadableStream } from './utils/createReadableStream';
import { withRefCount } from './utils/withRefCount';

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
const ASYNC_ITERABLE_STATUS_VALUE = 1;
type ASYNC_ITERABLE_STATUS_VALUE = typeof ASYNC_ITERABLE_STATUS_VALUE;
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
      status: ASYNC_ITERABLE_STATUS_VALUE,
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
export interface ProducerOptions {
  serialize?: Serialize;
  data: Record<string, unknown> | unknown[];
  onError?: ProducerOnError;
  formatError?: (opts: { error: unknown; path: PathArray }) => unknown;
  maxDepth?: number;
}

class MaxDepthError extends Error {
  constructor(public path: (string | number)[]) {
    super('Max depth reached at path: ' + path.join('.'));
  }
}

function createBatchStreamProducer(opts: ProducerOptions) {
  const { data } = opts;
  let counter = 0 as ChunkIndex;
  const placeholder = 0 as PlaceholderValue;

  const stream = createReadableStream<ChunkData>();
  const pending = withRefCount(new Set<ChunkIndex>(), () => {
    if (!stream.cancelled()) {
      stream.controller.close();
    }
  });

  const maybeEnqueue = (chunk: ChunkData) => {
    if (!stream.cancelled()) {
      stream.controller.enqueue(chunk);
    }
  };

  function encodePromise(promise: Promise<unknown>, path: (string | number)[]) {
    const error = checkMaxDepth(path);
    if (error) {
      // Catch any errors from the original promise to ensure they're reported
      promise.catch((cause) => {
        opts.onError?.({ error: cause, path });
      });
      // Replace the promise with a rejected one containing the max depth error
      promise = Promise.reject(error);
    }
    const idx = counter++ as ChunkIndex;
    pending.add(idx);

    promise
      .then((it) => {
        maybeEnqueue([idx, PROMISE_STATUS_FULFILLED, encode(it, path)]);
      })
      .catch((cause) => {
        opts.onError?.({ error: cause, path });
        maybeEnqueue([
          idx,
          PROMISE_STATUS_REJECTED,
          opts.formatError?.({ error: cause, path }),
        ]);
      })
      .finally(() => {
        pending.delete(idx);
      });
    return idx;
  }
  function encodeAsyncIterable(
    iterable: AsyncIterable<unknown>,
    path: (string | number)[],
  ) {
    const idx = counter++ as ChunkIndex;
    pending.add(idx);
    run(async () => {
      const error = checkMaxDepth(path);
      if (error) {
        throw error;
      }
      const iterator = iterable[Symbol.asyncIterator]();

      while (true) {
        if (stream.cancelled()) {
          const res = await iterator.return?.();
          return res?.value;
        }
        const next = await iterator.next();

        if (next.done) {
          maybeEnqueue([
            idx,
            ASYNC_ITERABLE_STATUS_RETURN,
            encode(next.value, path),
          ]);
          break;
        }
        maybeEnqueue([
          idx,
          ASYNC_ITERABLE_STATUS_VALUE,
          encode(next.value, path),
        ]);
      }
    })
      .catch((cause) => {
        opts.onError?.({ error: cause, path });
        maybeEnqueue([
          idx,
          ASYNC_ITERABLE_STATUS_ERROR,
          opts.formatError?.({ error: cause, path }),
        ]);
      })
      .finally(() => {
        pending.delete(idx);
      });
    return idx;
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
    if (!isObject(value)) {
      return [[value]];
    }
    const reg = encodeAsync(value, path);
    if (reg) {
      return [[placeholder], [null, ...reg]];
    }
    const newObj = {} as Record<string, unknown>;
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
  pending.activate();

  return [newHead, stream.readable] as const;
}
/**
 * JSON Lines stream producer
 * @see https://jsonlines.org/
 */
export function jsonlStreamProducer(opts: ProducerOptions) {
  let [head, stream] = createBatchStreamProducer(opts);

  const { serialize } = opts;
  if (serialize) {
    head = serialize(head);
    stream = stream.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          controller.enqueue(serialize(chunk));
        },
      }),
    );
  }

  return stream
    .pipeThrough(
      new TransformStream({
        start(controller) {
          controller.enqueue(JSON.stringify(head) + '\n');
        },
        transform(chunk, controller) {
          controller.enqueue(JSON.stringify(chunk) + '\n');
        },
      }),
    )
    .pipeThrough(new TextEncoderStream());
}

class StreamInterruptedError extends Error {
  constructor(cause?: unknown) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore https://github.com/tc39/proposal-error-cause
    super('Invalid response or stream interrupted', { cause });
  }
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
      const { readable, controller } = createReadableStream<Uint8Array>();
      source.on('data', (chunk) => {
        controller.enqueue(chunk);
      });
      source.on('end', () => {
        controller.close();
      });
      source.on('error', (error) => {
        controller.error(error);
      });
      return readable.getReader();
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

  type ControllerChunk = ChunkData | StreamInterruptedError;
  type ChunkController = ReadableStreamDefaultController<ControllerChunk>;
  /**
   * This is needed as new values can come in before the controller has read the chunk
   * Not pretty, could likely be refactored and omitted somehow
   */
  const chunkDeferred = new Map<ChunkIndex, Deferred<ChunkController>>();

  const controllers = new Map<ChunkIndex, ChunkController>();

  const maybeAbort = () => {
    if (chunkDeferred.size === 0 && controllers.size === 0) {
      // nothing is listening to the stream anymore
      opts.abortController?.abort();
    }
  };

  function decodeChunkDefinition(value: ChunkDefinition) {
    const [_path, type, chunkId] = value;

    const stream = createReadableStream<ChunkData>();

    controllers.set(chunkId, stream.controller);

    // resolve chunk deferred if it exists
    const deferred = chunkDeferred.get(chunkId);
    if (deferred) {
      deferred.resolve(stream.controller);
      chunkDeferred.delete(chunkId);
    }

    switch (type) {
      case CHUNK_VALUE_TYPE_PROMISE: {
        return new Promise((resolve, reject) => {
          // listen for next value in the stream
          const reader = stream.readable.getReader();
          reader
            .read()
            .then((it) => {
              if (it.done) {
                reject(new Error('Promise chunk ended without value'));
                return;
              }
              if (it.value instanceof StreamInterruptedError) {
                reject(it.value);
                return;
              }
              const value = it.value;
              const [_chunkId, status, data] = value as PromiseChunk;
              switch (status) {
                case PROMISE_STATUS_FULFILLED:
                  resolve(decode(data));

                  break;
                case PROMISE_STATUS_REJECTED:
                  reject(
                    opts.formatError?.({ error: data }) ?? new AsyncError(data),
                  );
                  break;
              }
            })
            .catch(reject)
            .finally(() => {
              controllers.delete(chunkId);
              maybeAbort();
            });
        });
      }
      case CHUNK_VALUE_TYPE_ASYNC_ITERABLE: {
        const reader = stream.readable.getReader();
        const iterator: AsyncIterator<unknown> = {
          next: async () => {
            const { done, value } = await reader.read();
            if (value instanceof StreamInterruptedError) {
              throw value;
            }
            if (done) {
              controllers.delete(chunkId);
              maybeAbort();

              return {
                done: true,
                value: undefined,
              };
            }

            const [_chunkId, status, data] = value as IterableChunk;

            switch (status) {
              case ASYNC_ITERABLE_STATUS_VALUE:
                return {
                  done: false,
                  value: decode(data),
                };
              case ASYNC_ITERABLE_STATUS_RETURN:
                controllers.delete(chunkId);
                maybeAbort();

                return {
                  done: true,
                  value: decode(data),
                };
              case ASYNC_ITERABLE_STATUS_ERROR:
                controllers.delete(chunkId);
                maybeAbort();

                throw (
                  opts.formatError?.({ error: data }) ?? new AsyncError(data)
                );
            }
          },
          return: async () => {
            controllers.delete(chunkId);
            maybeAbort();

            return {
              done: true,
              value: undefined,
            };
          },
        };
        return {
          [Symbol.asyncIterator]: () => iterator,
        };
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
    const error = new StreamInterruptedError(reason);

    headDeferred?.reject(error);
    for (const controller of controllers.values()) {
      controller.enqueue(error);
      controller.close();
    }
    controllers.clear();
  };
  source
    .pipeTo(
      new WritableStream({
        async write(chunkOrHead) {
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

          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          let readController = controllers.get(idx)!;
          if (!readController) {
            let deferred = chunkDeferred.get(idx);
            if (!deferred) {
              deferred = createDeferred();
              chunkDeferred.set(idx, deferred);
            }
            readController = await deferred.promise;
          }
          readController.enqueue(chunk);
        },
        close: closeOrAbort,
        abort: closeOrAbort,
      }),
      {
        signal: opts.abortController.signal,
      },
    )
    .catch((error) => {
      opts.onError?.({ error });
      closeOrAbort(error);
    });

  return [
    await headDeferred.promise,
    {
      controllers,
    },
  ] as const;
}
