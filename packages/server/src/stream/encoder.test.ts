import SuperJSON from 'superjson';
import { isObject } from '../unstable-core-do-not-import/utils';

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

type AsyncPropsPath =
  // root should be replaced
  | null
  // at array path
  | number
  // at key path
  | string;
type AsyncProps = [
  // key
  path: AsyncPropsPath,
  type: ChunkValueType,
  chunkId: ChunkIndex,
];
type Value = [
  // data
  [unknown],
  // chunk descriptions
  ...AsyncProps[],
];
type Head = Record<number, Value>;
type PromiseChunk =
  | [chunkIndex: ChunkIndex, status: PromiseStatus.FULFILLED, value: Value]
  | [chunkIndex: ChunkIndex, status: PromiseStatus.REJECTED, error?: unknown];
type IterableChunk =
  | [chunkIndex: ChunkIndex, status: IterableStatus.DONE]
  | [chunkIndex: ChunkIndex, status: IterableStatus.VALUE, value: Value]
  | [chunkIndex: ChunkIndex, status: IterableStatus.ERROR, error?: unknown];

type ChunkData = PromiseChunk | IterableChunk;
type PlaceholderValue = 0 & { __placeholder: true };

function isAsyncIterable<TValue>(
  value: unknown,
): value is AsyncIterable<TValue> {
  return (
    value != null && typeof value == 'object' && Symbol.asyncIterator in value
  );
}
function isPromise(value: unknown): value is Promise<unknown> {
  return value instanceof Promise;
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

type Serialize = (value: any) => any;
type Deserialize = (value: any) => any;

type ProducerOnError = (opts: {
  error: unknown;
  path: (string | number)[];
}) => void;
interface ProducerOptions {
  serialize?: Serialize;
  data: Record<number, unknown>;
  onError?: ProducerOnError;
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
    const asyncValues: AsyncProps[] = [];
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
    // transform the stream to deserialize each enqueued chunk
    const [newStream, newController] = createReadableStream<ChunkData>();
    stream.pipeTo(
      new WritableStream({
        write(chunk) {
          newController.enqueue(serialize(chunk));
        },
        close() {
          newController.close();
        },
      }),
    );
    return [head, newStream] as const;
  }

  return [newHead, stream] as const;
}
function createJsonBatchStreamProducer(opts: ProducerOptions) {
  const [sourceHead, sourceStream] = createBatchStreamProducer(opts);

  const [stream, controller] = createReadableStream<string>();

  controller.enqueue('[\n');
  controller.enqueue(JSON.stringify(sourceHead) + '\n');

  sourceStream.pipeTo(
    new WritableStream({
      write(chunk) {
        controller.enqueue(',');
        controller.enqueue(JSON.stringify(chunk));
        controller.enqueue('\n');
      },
      close() {
        controller.enqueue(']\n');
        controller.close();
      },
    }),
  );

  return stream;
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
async function createJsonBatchStreamConsumer<T>(opts: {
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

  function morphValue(value: AsyncProps) {
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
              const [_chunkId, status, data] = value;
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
                  return;
                case IterableStatus.ERROR:
                  throw new AsyncError(data);
              }
            }
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
    for (const controller of controllers.values()) {
      controller.enqueue(new StreamInterruptedError());
    }

    controllers.clear();
    await reader.cancel();
  }
  async function walkValues() {
    while (true) {
      while (acc.lines.length >= 2) {
        const line = acc.lines.shift()!;

        if (line === ']') {
          await kill();
          return;
        }

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

      void walkValues();

      return {
        head: newHead as T,
        controllers,
        reader,
      };
    }
  }

  throw new Error("Can't parse head");
}

test('encoder - superjson', async () => {
  const [head, stream] = createBatchStreamProducer({
    data: {
      0: Promise.resolve({
        foo: 'bar',
        deferred: Promise.resolve(42),
      }),
      1: Promise.resolve({
        [Symbol.asyncIterator]: async function* () {
          yield 1;
          yield 2;
          yield 3;
        },
      }),
    },
    serialize: SuperJSON.serialize,
  });

  const reader = stream.getReader();
  const chunks: ChunkData[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
  }

  expect(head).toMatchInlineSnapshot(`
    Object {
      "json": Object {
        "0": Array [
          Array [
            0,
          ],
          Array [
            null,
            0,
            0,
          ],
        ],
        "1": Array [
          Array [
            0,
          ],
          Array [
            null,
            0,
            1,
          ],
        ],
      },
    }
  `);
});

test('encode/decode', async () => {
  const data = {
    0: Promise.resolve({
      foo: {
        bar: {
          baz: 'qux',
        },
      },
      deferred: Promise.resolve(42),
    }),
    1: Promise.resolve({
      [Symbol.asyncIterator]: async function* () {
        yield 1;
        yield 2;
        yield 3;
      },
    }),
  } as const;
  const stream = createJsonBatchStreamProducer({
    data,
    serialize: (v) => SuperJSON.serialize(v),
  });

  const res = await createJsonBatchStreamConsumer<typeof data>({
    from: stream,
    deserialize: (v) => SuperJSON.deserialize(v),
  });
  const head = res.head;

  // console.log(inspect(head, undefined, 10));
  {
    expect(head[0]).toBeInstanceOf(Promise);

    const value = await head[0];
    expect(value.deferred).toBeInstanceOf(Promise);

    await expect(value.deferred).resolves.toBe(42);

    expect(value.foo.bar.baz).toBe('qux');
  }
  {
    expect(head[1]).toBeInstanceOf(Promise);

    const iterable = await head[1];
    expect(isAsyncIterable(iterable)).toBe(true);

    const aggregated: number[] = [];
    for await (const item of iterable) {
      aggregated.push(item);
    }
    expect(aggregated).toEqual([1, 2, 3]);
  }
  await res.reader.closed;
  expect(res.controllers.size).toBe(0);
});

test('encode/decode - error', async () => {
  const data = {
    0: Promise.resolve({
      foo: {
        bar: {
          baz: 'qux',
        },
      },
      deferred: Promise.reject(new Error('promise')),
    }),
    1: Promise.resolve({
      [Symbol.asyncIterator]: async function* () {
        yield 1;
        yield 2;
        yield 3;
        throw new Error('iterable');
      },
    }),
  } as const;

  const errors: unknown[] = [];

  type Args = Parameters<ProducerOnError>;
  const onErrorSpy = vi.fn<Parameters<ProducerOnError>, null>();

  const stream = createJsonBatchStreamProducer({
    data,
    serialize: (v) => SuperJSON.serialize(v),
    onError: onErrorSpy,
  });

  const res = await createJsonBatchStreamConsumer<typeof data>({
    from: stream,
    deserialize: (v) => SuperJSON.deserialize(v),
  });

  const head = res.head;

  {
    expect(head[0]).toBeInstanceOf(Promise);

    const value = await head[0];
    expect(value.deferred).toBeInstanceOf(Promise);

    await expect(value.deferred).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: Received error from server]`,
    );
  }
  {
    expect(head[1]).toBeInstanceOf(Promise);

    const iterable = await head[1];
    expect(isAsyncIterable(iterable)).toBe(true);

    const aggregated: number[] = [];
    try {
      for await (const item of iterable) {
        aggregated.push(item);
      }
    } catch (err) {
      errors.push(err);
    }
    expect(aggregated).toEqual([1, 2, 3]);

    expect(errors).toHaveLength(1);
  }

  expect(onErrorSpy).toHaveBeenCalledTimes(2);
  expect(onErrorSpy.mock.calls).toMatchInlineSnapshot(`
    Array [
      Array [
        Object {
          "error": [Error: promise],
          "path": Array [
            "0",
            "deferred",
          ],
        },
      ],
      Array [
        Object {
          "error": [Error: iterable],
          "path": Array [
            "1",
          ],
        },
      ],
    ]
  `);
});
