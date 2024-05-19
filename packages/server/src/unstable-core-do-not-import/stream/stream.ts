/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { isAsyncIterable, isFunction, isObject } from '../utils';

// ---------- utils

function createReadableStream<TValue = unknown>() {
  let controller: ReadableStreamDefaultController<TValue> =
    null as unknown as ReadableStreamDefaultController<TValue>;
  const stream = new ReadableStream<TValue>({
    start(c) {
      controller = c;
    },
  });

  return [stream, controller] as const;
}

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

const ASYNC_ITERABLE_STATUS_DONE = 0;
type ASYNC_ITERABLE_STATUS_DONE = typeof ASYNC_ITERABLE_STATUS_DONE;
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
type HydratedValue = [
  // data
  [unknown],
  // chunk descriptions
  ...ChunkDefinition[],
];

type Head = Record<string, HydratedValue>;
type PromiseChunk =
  | [
      chunkIndex: ChunkIndex,
      status: PROMISE_STATUS_FULFILLED,
      value: HydratedValue,
    ]
  | [
      chunkIndex: ChunkIndex,
      status: PROMISE_STATUS_REJECTED,
      // do we want to serialize errors?
      // , error?: unknown
    ];
type IterableChunk =
  | [chunkIndex: ChunkIndex, status: ASYNC_ITERABLE_STATUS_DONE]
  | [
      chunkIndex: ChunkIndex,
      status: ASYNC_ITERABLE_STATUS_VALUE,
      value: HydratedValue,
    ]
  | [
      chunkIndex: ChunkIndex,
      status: ASYNC_ITERABLE_STATUS_ERROR,
      // do we want to serialize errors?
      // , error?: unknown
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

export type ProducerOnError = (opts: {
  error: unknown;
  path: (string | number)[];
}) => void;
export interface ProducerOptions {
  serialize?: Serialize;
  data: Record<number, unknown>;
  onError?: ProducerOnError;
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

  const [stream, controller] = createReadableStream<ChunkData>();
  const pending = new Set<ChunkIndex>();
  function maybeClose() {
    if (pending.size === 0) {
      controller.close();
    }
  }
  function hydratePromise(
    promise: Promise<unknown>,
    path: (string | number)[],
  ) {
    //
    const error = checkMaxDepth(path);
    if (error) {
      promise.catch(() => {
        // ignore
      });
      promise = Promise.reject(error);
    }
    const idx = counter++ as ChunkIndex;
    pending.add(idx);
    const enqueue = (value: PromiseChunk) => {
      controller.enqueue(value);
    };
    promise
      .then((it) => {
        enqueue([idx, PROMISE_STATUS_FULFILLED, hydrate(it, path)]);
      })
      .catch((err) => {
        opts.onError?.({ error: err, path });
        enqueue([idx, PROMISE_STATUS_REJECTED]);
      })
      .finally(() => {
        pending.delete(idx);
        maybeClose();
      });
    return idx;
  }
  function hydrateAsyncIterable(
    iterable: AsyncIterable<unknown>,
    path: (string | number)[],
  ) {
    const error = checkMaxDepth(path);
    if (error) {
      iterable = {
        [Symbol.asyncIterator]() {
          throw error;
        },
      };
    }
    const idx = counter++ as ChunkIndex;
    pending.add(idx);
    void (async () => {
      try {
        for await (const item of iterable) {
          controller.enqueue([
            idx,
            ASYNC_ITERABLE_STATUS_VALUE,
            hydrate(item, path),
          ]);
        }
        controller.enqueue([idx, ASYNC_ITERABLE_STATUS_DONE]);
      } catch (error) {
        opts.onError?.({ error, path });
        controller.enqueue([idx, ASYNC_ITERABLE_STATUS_ERROR]);
      } finally {
        pending.delete(idx);
        maybeClose();
      }
    })();
    return idx;
  }
  function checkMaxDepth(path: (string | number)[]) {
    if (opts.maxDepth && path.length > opts.maxDepth) {
      return new MaxDepthError(path);
    }
    return null;
  }
  function hydrateChunk(
    value: unknown,
    path: (string | number)[],
  ): null | [type: ChunkValueType, chunkId: ChunkIndex] {
    if (isPromise(value)) {
      return [CHUNK_VALUE_TYPE_PROMISE, hydratePromise(value, path)];
    }
    if (isAsyncIterable(value)) {
      if (opts.maxDepth && path.length >= opts.maxDepth) {
        throw new Error('Max depth reached');
      }
      return [
        CHUNK_VALUE_TYPE_ASYNC_ITERABLE,
        hydrateAsyncIterable(value, path),
      ];
    }
    return null;
  }
  function hydrate(value: unknown, path: (string | number)[]): HydratedValue {
    const reg = hydrateChunk(value, path);
    if (reg) {
      return [[placeholder], [null, ...reg]];
    }
    if (!isObject(value)) {
      return [[value]];
    }
    const newObj = {} as Record<string, unknown>;
    const asyncValues: ChunkDefinition[] = [];
    for (const [key, item] of Object.entries(value)) {
      const transformed = hydrateChunk(item, [...path, key]);
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
    newHead[key] = hydrate(item, [key]);
  }

  return [newHead, stream] as const;
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
      const [stream, controller] = createReadableStream<Uint8Array>();
      source.on('data', (chunk) => {
        controller.enqueue(chunk);
      });
      source.on('end', () => {
        controller.close();
      });
      source.on('error', (error) => {
        controller.error(error);
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

function createDeferred<TValue>() {
  let resolve: (value: TValue) => void;
  let reject: (error: unknown) => void;
  const promise = new Promise<TValue>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve: resolve!, reject: reject! };
}

type Deferred<TValue> = ReturnType<typeof createDeferred<TValue>>;

/**
 * JSON Lines stream consumer
 * @see https://jsonlines.org/
 */
export async function jsonlStreamConsumer<THead>(opts: {
  from: NodeJSReadableStreamEsque | WebReadableStreamEsque;
  deserialize?: Deserialize;
  onError?: ConsumerOnError;
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
  const chunkDeferred = new Map<ChunkIndex, Deferred<ChunkController>>();
  const controllers = new Map<ChunkIndex, ChunkController>();

  function dehydrateChunkDefinition(value: ChunkDefinition) {
    const [_path, type, chunkId] = value;

    const [stream, controller] = createReadableStream<ChunkData>();
    controllers.set(chunkId, controller);

    // resolve chunk deferred if it exists
    const deferred = chunkDeferred.get(chunkId);
    if (deferred) {
      deferred.resolve(controller);
      chunkDeferred.delete(chunkId);
    }

    switch (type) {
      case CHUNK_VALUE_TYPE_PROMISE: {
        return new Promise((resolve, reject) => {
          // listen for next value in the stream
          const reader = stream.getReader();
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
                  resolve(dehydrate(data));
                  break;
                case PROMISE_STATUS_REJECTED:
                  reject(new AsyncError(data));
                  break;
              }
            })
            .catch(reject)
            .finally(() => {
              // reader.releaseLock();
              controllers.delete(chunkId);
            });
        });
      }
      case CHUNK_VALUE_TYPE_ASYNC_ITERABLE: {
        return {
          [Symbol.asyncIterator]: async function* () {
            const reader = stream.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                break;
              }
              if (value instanceof StreamInterruptedError) {
                throw value;
              }

              const [_chunkId, status, data] = value as IterableChunk;

              switch (status) {
                case ASYNC_ITERABLE_STATUS_VALUE:
                  yield dehydrate(data);
                  break;
                case ASYNC_ITERABLE_STATUS_DONE:
                  controllers.delete(chunkId);
                  return;
                case ASYNC_ITERABLE_STATUS_ERROR:
                  controllers.delete(chunkId);
                  throw new AsyncError(data);
              }
            }
          },
        };
      }
    }
  }

  function dehydrate(value: HydratedValue): unknown {
    const [[data], ...asyncProps] = value;

    for (const value of asyncProps) {
      const dehydrated = dehydrateChunkDefinition(value);

      const [path] = value;
      if (path === null) {
        return dehydrated;
      }

      (data as any)[path] = dehydrated;
    }
    return data;
  }

  const closeOrAbort = (reason?: unknown) => {
    const error = new StreamInterruptedError(reason);

    headDeferred?.reject(error);
    for (const deferred of chunkDeferred.values()) {
      deferred.reject(error);
    }
    chunkDeferred.clear();
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
              const parsed = dehydrate(value);
              head[key] = parsed;
            }
            headDeferred.resolve(head as THead);
            headDeferred = null;
            return;
          }
          const chunk = chunkOrHead as ChunkData;
          const [idx] = chunk;
          let controller = controllers.get(idx);
          if (!controller) {
            let deferred = chunkDeferred.get(idx);
            if (!deferred) {
              deferred = createDeferred<ChunkController>();
              chunkDeferred.set(idx, deferred);
            }

            controller = await deferred.promise;
          }
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

  return [
    await headDeferred.promise,
    {
      controllers,
    },
  ] as const;
}
