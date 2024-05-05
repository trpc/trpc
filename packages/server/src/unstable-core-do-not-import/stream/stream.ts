/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { isObject } from '../utils';

// ---------- utils
function isAsyncIterable<TValue>(
  value: unknown,
): value is AsyncIterable<TValue> {
  return isObject(value) && Symbol.asyncIterator in value;
}

export function createReadableStream<TValue = unknown>() {
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

type Head = Record<number, HydratedValue>;
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
function isPromise(value: unknown): value is Promise<unknown> {
  return isObject(value) && typeof (value as any).then === 'function';
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
export function createBatchStreamProducer(opts: ProducerOptions) {
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
      iterable = (async function* () {
        throw error;
      })();
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
    newHead[Number(key)] = hydrate(item, [key]);
  }

  const serialize = opts.serialize;
  if (serialize) {
    const head = serialize(newHead) as Head;

    const transformStream = new TransformStream<ChunkData, ChunkData>({
      transform(chunk, controller) {
        controller.enqueue(serialize(chunk));
      },
    });
    return [head, stream.pipeThrough(transformStream)] as const;
  }

  return [newHead, stream] as const;
}
export function createJsonBatchStreamProducer(opts: ProducerOptions) {
  const [sourceHead, sourceStream] = createBatchStreamProducer(opts);

  return sourceStream.pipeThrough(
    new TransformStream({
      start(controller) {
        controller.enqueue('[\n');
        controller.enqueue(JSON.stringify(sourceHead) + '\n');
      },
      transform(chunk, controller) {
        controller.enqueue(',');
        controller.enqueue(JSON.stringify(chunk));
        controller.enqueue('\n');
      },
      flush(controller) {
        controller.enqueue(']\n');
      },
    }),
  );
}
function lineAccumulator() {
  let accumulator = '';
  const lines: string[] = [];
  let decoder: TextDecoder;

  return {
    lines,
    push(chunk: AllowSharedBufferSource | string) {
      if (typeof chunk === 'string') {
        accumulator += chunk;
      } else {
        decoder ??= new TextDecoder();
        accumulator += decoder.decode(chunk);
      }

      const parts = accumulator.split('\n');
      accumulator = parts.pop() ?? '';
      lines.push(...parts);
    },
  };
}
class StreamInterruptedError extends Error {
  constructor() {
    super('Stream interrupted');
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
      return stream.getReader();
    },
  };
};

export async function createJsonBatchStreamConsumer<THead>(opts: {
  from: NodeJSReadableStreamEsque | WebReadableStreamEsque;
  deserialize?: Deserialize;
  onError?: ConsumerOnError;
}) {
  const { deserialize = (v) => v, from } = opts;

  const reader =
    'getReader' in from
      ? from.getReader()
      : nodeJsStreamToReaderEsque(from).getReader();

  const acc = lineAccumulator();

  type ControllerChunk = ChunkData | StreamInterruptedError;
  const chunkStreams = new Map<
    ChunkIndex,
    ReturnType<typeof createReadableStream<ControllerChunk>>
  >();
  const upsertChunkStream = (chunkId: ChunkIndex) => {
    const controller = chunkStreams.get(chunkId);
    if (controller) {
      return controller;
    }
    const chunk = createReadableStream<ControllerChunk>();
    chunkStreams.set(chunkId, chunk);
    return chunk;
  };

  function dehydrateChunkDefinition(value: ChunkDefinition) {
    const [_path, type, chunkId] = value;

    const [stream] = upsertChunkStream(chunkId);

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
              chunkStreams.delete(chunkId);
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
                  chunkStreams.delete(chunkId);
                  return;
                case ASYNC_ITERABLE_STATUS_ERROR:
                  chunkStreams.delete(chunkId);
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

  async function end() {
    try {
      for (const [_, controller] of chunkStreams.values()) {
        controller.enqueue(new StreamInterruptedError());
      }

      chunkStreams.clear();
    } catch (error) {
      opts.onError?.({ error });
    }
  }
  async function walkValues() {
    while (true) {
      while (acc.lines.length > 1) {
        const line = acc.lines.shift()!;

        const chunk: ChunkData = deserialize(
          JSON.parse(
            // each line starts with a comma
            line.substring(1),
          ),
        );

        const [idx] = chunk;
        const [_stream, controller] = upsertChunkStream(idx);
        controller.enqueue(chunk);
      }
      const { done, value } = await reader.read();
      if (done) {
        await end();
        return;
      }
      acc.push(value);
    }
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    acc.push(value);

    if (acc.lines.length >= 2) {
      /**
       * First line is just a `[`
       */
      acc.lines.shift();

      const { deserialize = (v) => v } = opts;
      const head: Head = deserialize(JSON.parse(acc.lines.shift() ?? ''));

      const newHead = head as Record<number, unknown>;
      for (const [key, value] of Object.entries(head)) {
        const parsed = dehydrate(value);
        newHead[Number(key)] = parsed;
      }

      walkValues().catch((error) => {
        opts?.onError?.({ error });
        return end();
      });

      return [
        newHead as THead,
        {
          controllers: chunkStreams,
          reader,
        },
      ] satisfies [THead, unknown];
    }
  }

  throw new Error("Couldn't parse head");
}
