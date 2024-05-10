/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { getTRPCErrorFromUnknown } from '../error/TRPCError';
import type { TypeError } from '../types';
import { Overwrite } from '../types';
import { isAsyncIterable, isFunction, isObject, run } from '../utils';

// ---------- utils

/**
 * One-off readable stream
 */
function createReadableStream<TValue = unknown>() {
  let controller: ReadableStreamDefaultController<TValue> =
    null as unknown as ReadableStreamDefaultController<TValue>;

  const deferred = createDeferred<null>();
  let cancelled = false;
  const readable = new ReadableStream<TValue>({
    start(c) {
      controller = c;
    },
    cancel() {
      deferred.resolve(null);
      cancelled = true;
    },
  });

  return {
    readable,
    controller,
    cancelledPromise: deferred.promise,
    cancelled() {
      return cancelled;
    },
  } as const;
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
export interface ProducerOptions<TData = never> {
  serialize?: Serialize;
  data: TData;
  onError?: ProducerOnError;
  maxDepth?: number;
}

class MaxDepthError extends Error {
  constructor(public path: (string | number)[]) {
    super('Max depth reached at path: ' + path.join('.'));
  }
}

function createBatchStreamProducer(
  opts: ProducerOptions<Record<string, unknown>>,
) {
  const { data } = opts;
  let counter = 0 as ChunkIndex;
  const placeholder = 0 as PlaceholderValue;

  const stream = createReadableStream<ChunkData>();
  const pending = new Set<ChunkIndex>();

  function maybeClose() {
    if (pending.size === 0 && !stream.cancelled()) {
      stream.controller.close();
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

    Promise.race([promise, stream.cancelledPromise])
      .then((it) => {
        if (it === null) {
          return;
        }
        stream.controller.enqueue([
          idx,
          PROMISE_STATUS_FULFILLED,
          hydrate(it, path),
        ]);
      })
      .catch((err) => {
        opts.onError?.({ error: err, path });
        stream.controller.enqueue([idx, PROMISE_STATUS_REJECTED]);
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
      iterable = (async function* () {
        throw error;
      })();
    }
    const idx = counter++ as ChunkIndex;
    pending.add(idx);
    run(async () => {
      const iterator = iterable[Symbol.asyncIterator]();

      while (true) {
        const next = await Promise.race([
          iterator.next().catch(getTRPCErrorFromUnknown),
          stream.cancelledPromise,
        ]);

        if (next instanceof Error) {
          opts.onError?.({ error: next, path });
          stream.controller.enqueue([idx, ASYNC_ITERABLE_STATUS_ERROR]);
          return;
        }
        if (next === null) {
          await iterator.return?.();
          break;
        }
        if (next.done) {
          stream.controller.enqueue([idx, ASYNC_ITERABLE_STATUS_DONE]);
          break;
        }
        stream.controller.enqueue([
          idx,
          ASYNC_ITERABLE_STATUS_VALUE,
          hydrate(next.value, path),
        ]);
      }

      pending.delete(idx);
      maybeClose();
    }).catch((cause) => {
      // this shouldn't happen, but node crashes if we don't catch it
      opts.onError?.({
        error: new Error(
          'You found a bug - please report it on https://github.com/trpc/trpc',
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore https://github.com/tc39/proposal-error-cause
          {
            cause,
          },
        ),
        path,
      });
    });
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

  return [newHead, stream.readable] as const;
}
/**
 * JSON Lines stream producer
 * @see https://jsonlines.org/
 */
export function jsonlStreamProducer(
  opts: ProducerOptions<Record<string, unknown>>,
) {
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

export type SSEChunk = {
  data?: unknown;
  id?: string | number;
  event?: string;
};

type SerializedSSEChunk = Omit<SSEChunk, 'data'> & {
  data?: string;
};

/**
 *
 * @see https://html.spec.whatwg.org/multipage/server-sent-events.html
 */
export function sseStreamProducer(
  opts: ProducerOptions<AsyncIterable<unknown>>,
) {
  const responseStream = new TransformStream<SerializedSSEChunk, string>({
    transform(chunk, controller) {
      if ('event' in chunk) {
        controller.enqueue(`event: ${chunk.event}\n`);
      }
      if ('data' in chunk) {
        controller.enqueue(`data: ${chunk.data}\n`);
      }
      if ('id' in chunk) {
        controller.enqueue(`id: ${chunk.id}\n`);
      }
      controller.enqueue('\n\n');
    },
  });
  const writer = responseStream.writable.getWriter();

  const { serialize = (v) => v } = opts;

  run(async () => {
    const iterator = opts.data[Symbol.asyncIterator]();

    const pingPromise = () => {
      let deferred = createDeferred<'ping'>();
      deferred = deferred as typeof deferred & { clear: () => void };

      const timeout = setTimeout(() => {
        deferred.resolve('ping');
      }, 1000);

      return {
        promise: deferred.promise,
        clear: () => {
          clearTimeout(timeout);
        },
      };
    };
    const closedPromise = writer.closed.then(() => 'closed' as const);

    let nextPromise = iterator.next();
    while (true) {
      const ping = pingPromise();
      const next = await Promise.race([
        nextPromise.catch(getTRPCErrorFromUnknown),
        ping.promise,
        closedPromise,
      ]);
      ping.clear();

      if (next === 'closed') {
        await iterator.return?.();
        break;
      }

      if (next === 'ping') {
        await writer.write({
          data: '',
          event: 'ping',
        });
        continue;
      }

      if (next instanceof Error) {
        await writer.abort(next);
        break;
      }
      if (next.done) {
        break;
      }

      const value = next.value;

      if (!isObject(value)) {
        await iterator.throw?.(new TypeError(`Expected a SerializedSSEChunk`));
        return;
      }
      const chunk: SerializedSSEChunk = {};
      if (typeof value['id'] === 'string' || typeof value['id'] === 'number') {
        chunk.id = value['id'];
      }
      if (typeof value['event'] === 'string') {
        chunk.event = value['event'];
      }
      if ('data' in value) {
        chunk.data = JSON.stringify(serialize(value['data']));
      }

      //
      await writer.write(chunk);
      nextPromise = iterator.next();
    }
  }).catch((error) => {
    return writer.abort(error);
  });

  return responseStream.readable;
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

    const { readable, controller } = createReadableStream<ChunkData>();
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
          const reader = readable.getReader();
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
            const reader = readable.getReader();
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

type inferSSEOutput<TData> = TData extends SSEChunk
  ? TData
  : TypeError<'Expected a SSEChunk - use `satisfies SSEChunk'>;

/**
 * @see https://html.spec.whatwg.org/multipage/server-sent-events.html
 */
export function sseStreamConsumer<TData>(opts: {
  from: EventSource;
  onError?: ConsumerOnError;
  deserialize?: Deserialize;
}): AsyncIterable<inferSSEOutput<TData>> {
  const { deserialize = (v) => v } = opts;

  const response = new TransformStream<
    SerializedSSEChunk,
    inferSSEOutput<TData>
  >({
    async transform(chunk, controller) {
      if (chunk.data) {
        const def: SSEChunk = {};
        def.data = deserialize(JSON.parse(chunk.data));
        if ('id' in chunk) {
          def.id = chunk.id;
        }
        if ('event' in chunk) {
          def.event = chunk.event;
        }

        controller.enqueue(def as inferSSEOutput<TData>);
      }
    },
  });
  const writer = response.writable.getWriter();

  opts.from.addEventListener('message', (msg) => {
    writer
      .write({
        data: msg.data,
      })
      .catch((error) => {
        opts.onError?.({ error });
      });
  });
  return {
    [Symbol.asyncIterator]() {
      const reader = response.readable.getReader();

      const iterator: AsyncIterator<inferSSEOutput<TData>> = {
        async next() {
          const value = await reader.read();
          if (value.done) {
            return {
              value: undefined,
              done: true,
            };
          }
          return {
            value: value.value,
            done: false,
          };
        },
        async return() {
          reader.releaseLock();
          return {
            value: undefined,
            done: true,
          };
        },
      };
      return iterator;
    },
  };
}
