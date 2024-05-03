/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { isObject } from '../unstable-core-do-not-import/utils';

// ---------- utils
function isAsyncIterable<TValue>(
  value: unknown,
): value is AsyncIterable<TValue> {
  return (
    value != null && typeof value == 'object' && Symbol.asyncIterator in value
  );
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
// ---------- types

type ChunkIndex = number & { __chunkIndex: true };
enum ChunkValueType {
  PROMISE = 0,
  ITERABLE = 1,
}
enum PromiseStatus {
  FULFILLED = 0,
  REJECTED = 1,
}
enum IterableStatus {
  VALUE = 0,
  DONE = 1,
  ERROR = 2,
}
type ChunkDefinitionKey =
  // root should be replaced
  | null
  // at array path
  | number
  // at key path
  | string;
type ChunkDefinition = [
  key: ChunkDefinitionKey,
  type: ChunkValueType,
  chunkId: ChunkIndex,
];
type Value = [
  // data
  [unknown],
  // chunk descriptions
  ...ChunkDefinition[],
];
type Head = Record<number, Value>;
type PromiseChunk =
  | [chunkIndex: ChunkIndex, status: PromiseStatus.FULFILLED, value: Value]
  | [
      chunkIndex: ChunkIndex,
      status: PromiseStatus.REJECTED,
      // do we want to serialize errors?
      // , error?: unknown
    ];
type IterableChunk =
  | [chunkIndex: ChunkIndex, status: IterableStatus.DONE]
  | [chunkIndex: ChunkIndex, status: IterableStatus.VALUE, value: Value]
  | [
      chunkIndex: ChunkIndex,
      status: IterableStatus.ERROR,
      // do we want to serialize errors?
      // , error?: unknown
    ];
type ChunkData = PromiseChunk | IterableChunk;
type PlaceholderValue = 0 & { __placeholder: true };
function isPromise(value: unknown): value is Promise<unknown> {
  return value instanceof Promise;
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
  function registerPromise(
    promise: Promise<unknown>,
    path: (string | number)[],
  ) {
    const idx = counter++ as ChunkIndex;
    pending.add(idx);
    const enqueue = (value: PromiseChunk) => {
      controller.enqueue(value);
    };
    promise
      .then((it) => {
        enqueue([idx, PromiseStatus.FULFILLED, getValue(it, path)]);
      })
      .catch((err) => {
        opts.onError?.({ error: err, path });
        enqueue([idx, PromiseStatus.REJECTED]);
      })
      .finally(() => {
        pending.delete(idx);
        maybeClose();
      });
    return idx;
  }
  function registerIterable(
    iterable: AsyncIterable<unknown>,
    path: (string | number)[],
  ) {
    const idx = counter++ as ChunkIndex;
    pending.add(idx);
    void (async () => {
      try {
        for await (const item of iterable) {
          controller.enqueue([idx, IterableStatus.VALUE, getValue(item, path)]);
        }
        controller.enqueue([idx, IterableStatus.DONE]);
      } catch (error) {
        opts.onError?.({ error, path });
        controller.enqueue([idx, IterableStatus.ERROR]);
      } finally {
        pending.delete(idx);
        maybeClose();
      }
    })();
    return idx;
  }
  function getValue(value: unknown, path: (string | number)[]): Value {
    if (isPromise(value)) {
      return [
        [placeholder],
        [null, ChunkValueType.PROMISE, registerPromise(value, path)],
      ];
    } else if (isAsyncIterable(value)) {
      return [
        [placeholder],
        [null, ChunkValueType.ITERABLE, registerIterable(value, path)],
      ];
    }
    if (!isObject(value)) {
      return [[value]];
    }
    const newObj = {} as Record<string, unknown>;
    const asyncValues: ChunkDefinition[] = [];
    for (const [key, item] of Object.entries(value)) {
      if (isPromise(item)) {
        newObj[key] = placeholder;
        asyncValues.push([
          key,
          ChunkValueType.PROMISE,
          registerPromise(item, [...path, key]),
        ]);
        continue;
      }
      if (isAsyncIterable(item)) {
        newObj[key] = placeholder;
        asyncValues.push([
          key,
          ChunkValueType.ITERABLE,
          registerIterable(item, [...path, key]),
        ]);
        continue;
      }
      newObj[key] = item;
    }
    return [[newObj], ...asyncValues];
  }

  const newHead: Head = {};
  for (const [key, item] of Object.entries(data)) {
    newHead[Number(key)] = getValue(item, [key]);
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

  return {
    lines,
    push(chunk: AllowSharedBufferSource | string) {
      accumulator +=
        typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);

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
export async function createJsonBatchStreamConsumer<THead>(opts: {
  from: ReadableStream<AllowSharedBufferSource | string>;
  deserialize?: Deserialize;
}) {
  const { deserialize = (v) => v } = opts;
  const textDecoder = new TextDecoder();

  const reader = opts.from.getReader();
  const acc = lineAccumulator();

  type ControllerChunk = ChunkData | StreamInterruptedError;
  const controllers = new Map<
    ChunkIndex,
    ReadableStreamDefaultController<ControllerChunk>
  >();

  function morphValue(value: ChunkDefinition) {
    const [_path, type, chunkId] = value;

    const [stream, controller] = createReadableStream<ControllerChunk>();
    controllers.set(chunkId, controller);
    switch (type) {
      case ChunkValueType.PROMISE: {
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
                case PromiseStatus.FULFILLED:
                  resolve(parseValue(data));
                  break;
                case PromiseStatus.REJECTED:
                  reject(new AsyncError(data));
                  break;
              }
            })
            .catch(reject)
            .finally(() => {
              reader.releaseLock();
              controllers.delete(chunkId);
            });
        });
      }
      case ChunkValueType.ITERABLE: {
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
                case IterableStatus.VALUE:
                  yield parseValue(data);
                  break;
                case IterableStatus.DONE:
                  controllers.delete(chunkId);
                  break;
                case IterableStatus.ERROR:
                  throw new AsyncError(data);
              }
            }

            reader.releaseLock();
          },
        };
      }
    }
  }

  function parseValue(value: Value): unknown {
    const [[data], ...asyncProps] = value;

    for (const value of asyncProps) {
      const deserialized = morphValue(value);

      const [path] = value;
      if (path === null) {
        return deserialized;
      }

      (data as any)[path] = deserialized;
    }
    return data;
  }

  async function kill() {
    try {
      for (const controller of controllers.values()) {
        controller.enqueue(new StreamInterruptedError());
      }

      controllers.clear();
      await reader.cancel();
    } catch (error) {
      // TODO: log error
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
        // console.log('chunk', chunk);
        const [idx] = chunk;
        const controller = controllers.get(idx)!;
        controller.enqueue(chunk);
      }
      const { done, value } = await reader.read();
      if (done) {
        await kill();
        return;
      }
      acc.push(typeof value === 'string' ? value : textDecoder.decode(value));
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
        const parsed = parseValue(value);
        newHead[Number(key)] = parsed;
      }

      walkValues().catch(kill);

      return [
        newHead as THead,
        {
          controllers,
          reader,
        },
      ] satisfies [THead, unknown];
    }
  }

  throw new Error("Can't parse head");
}
