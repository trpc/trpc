/*
given {
    0: {
        foo: "bar",
        deferred: Promise<number>,
    }
    1: AsyncIterable<number>,
}
*/

import { inspect } from 'util';
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

type AsyncProps = [
  // key
  path:  // root
    | null
    // at array path
    | number
    // at key path
    | string,
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
type PromiseChunk = [
  chunkIndex: ChunkIndex,
  status: PromiseStatus,
  value: Value,
];
type IterableChunk =
  | [chunkIndex: ChunkIndex, status: IterableStatus.DONE]
  | [chunkIndex: ChunkIndex, status: IterableStatus.VALUE, value: Value]
  | [chunkIndex: ChunkIndex, status: IterableStatus.ERROR, error: unknown];

type ChunkData = PromiseChunk | IterableChunk;
type Envelope = [Head, ...ChunkData[]];
type PlaceholderValue = 0 & { __placeholder: true };

// const exampleEnvelope: Envelope = [
//   // first comes the head that describes the data
//   {
//     0: [
//       {
//         foo: 'bar',
//         deferred: null,
//       },
//       [
//         [
//           // path
//           'deferred',
//           ChunkValueType.PROMISE,
//           0,
//         ],
//       ],
//     ],
//     1: [
//       // shape is null because it's an iterable
//       null,
//       [
//         [
//           // path is null because it's at the root
//           null,
//           ChunkValueType.ITERABLE,
//           1,
//         ],
//       ],
//     ],
//   },
//   // then comes the data
//   [0, PromiseStatus.FULFILLED, 42],
//   [1, IterableStatus.VALUE, 1],
//   [1, IterableStatus.DONE],
// ];

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

interface ProducerOptions {
  serialize?: Serialize;
  data: Record<number, unknown>;
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
  function registerPromise(promise: Promise<unknown>) {
    const idx = counter++ as ChunkIndex;
    pending.add(idx);
    promise
      .then((it) => {
        controller.enqueue([idx, PromiseStatus.FULFILLED, getValue(it)]);
      })
      .catch((err) => {
        controller.enqueue([idx, PromiseStatus.REJECTED, err]);
      })
      .finally(() => {
        pending.delete(idx);
        maybeClose();
      });
    return idx;
  }
  function registerIterable(iterable: AsyncIterable<unknown>) {
    const idx = counter++ as ChunkIndex;
    pending.add(idx);
    void (async () => {
      try {
        for await (const item of iterable) {
          controller.enqueue([idx, IterableStatus.VALUE, getValue(item)]);
        }
        controller.enqueue([idx, IterableStatus.DONE]);
      } catch (err) {
        controller.enqueue([idx, IterableStatus.ERROR, err]);
      } finally {
        pending.delete(idx);
        maybeClose();
      }
    })();
    return idx;
  }
  function getValue(value: unknown): Value {
    if (isPromise(value)) {
      return [
        [placeholder],
        [null, ChunkValueType.PROMISE, registerPromise(value)],
      ];
    } else if (isAsyncIterable(value)) {
      return [
        [placeholder],
        [null, ChunkValueType.ITERABLE, registerIterable(value)],
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
        asyncValues.push([key, ChunkValueType.PROMISE, registerPromise(item)]);
        continue;
      }
      if (isAsyncIterable(item)) {
        newObj[key] = placeholder;
        asyncValues.push([
          key,
          ChunkValueType.ITERABLE,
          registerIterable(item),
        ]);
        continue;
      }
      newObj[key] = item;
    }
    return [[newObj], ...asyncValues];
  }

  const newHead: Head = {};
  for (const [key, item] of Object.entries(data)) {
    newHead[Number(key)] = getValue(item);
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
    push(chunk: string) {
      accumulator += chunk;

      const parts = accumulator.split('\n');
      accumulator = parts.pop() ?? '';
      lines.push(...parts);
    },
  };
}

function assertAsyncIterable<TValue>(
  value: any,
): asserts value is AsyncIterable<TValue> {
  if (!(Symbol.asyncIterator in value)) {
    throw new Error('Expected AsyncIterable - are you using Node >= 18.0.0?');
  }
}

async function createJsonBatchStreamConsumer<T>(opts: {
  from: ReadableStream<string>;
  deserialize?: Deserialize;
}) {
  const { deserialize = (v) => v } = opts;

  const reader = opts.from.getReader();
  const acc = lineAccumulator();
  const controllers = new Map<
    ChunkIndex,
    ReadableStreamDefaultController<ChunkData>
  >();

  function morphValue(value: AsyncProps) {
    const [_path, type, chunkId] = value;

    const [stream, controller] = createReadableStream<ChunkData>();
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
              const value = it.value as PromiseChunk;
              const [_chunkId, status, data] = value;
              switch (status) {
                case PromiseStatus.FULFILLED:
                  resolve(parseValue(data));
                  break;
                case PromiseStatus.REJECTED:
                  reject(data);
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
              const [_chunkId, status, data] = value as IterableChunk;

              switch (status) {
                case IterableStatus.VALUE:
                  yield parseValue(data);
                  break;
                case IterableStatus.DONE:
                  controllers.delete(chunkId);
                  return;
                case IterableStatus.ERROR:
                  throw data;
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

      console.log('setting', { path }, deserialized);
      data[path] = deserialized;
    }
    return data;
  }

  function consumeValue(value: Value) {}
  async function kill() {
    await reader.cancel();
  }
  async function walkValues() {
    while (true) {
      while (acc.lines.length >= 2) {
        const line = acc.lines.shift()!;
        // console.log('line', line);

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
        console.log('chunk', chunk);

        const [idx] = chunk;
        const controller = controllers.get(idx)!;
        controller.enqueue(chunk);
      }
      const { done, value } = await reader.read();
      if (done) {
        await kill();
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
      0: {
        foo: 'bar',
        deferred: Promise.resolve(42),
      },
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
      "0": Array [
        Array [
          Object {
            "deferred": 0,
            "foo": Object {
              "json": "bar",
            },
          },
        ],
        Array [
          "deferred",
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
    }
  `);
});

test('encoder - json', async () => {
  const stream = createJsonBatchStreamProducer({
    data: {
      0: {
        foo: 'bar',
        deferred: Promise.resolve(42),
      },
      1: Promise.resolve({
        [Symbol.asyncIterator]: async function* () {
          yield 1;
          yield 2;
          yield 3;
        },
      }),
    },
  });

  const reader = stream.getReader();
  const chunks: string[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
  }

  JSON.parse(chunks.join(''));
  expect(JSON.parse(chunks.join(''))).toMatchInlineSnapshot(`
    Array [
      Object {
        "0": Array [
          Array [
            Object {
              "deferred": 0,
              "foo": "bar",
            },
          ],
          Array [
            "deferred",
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
      Array [
        0,
        0,
        Array [
          Array [
            42,
          ],
        ],
      ],
      Array [
        1,
        0,
        Array [
          Array [
            0,
          ],
          Array [
            null,
            1,
            2,
          ],
        ],
      ],
      Array [
        2,
        0,
        Array [
          Array [
            1,
          ],
        ],
      ],
      Array [
        2,
        0,
        Array [
          Array [
            2,
          ],
        ],
      ],
      Array [
        2,
        0,
        Array [
          Array [
            3,
          ],
        ],
      ],
      Array [
        2,
        1,
      ],
    ]
  `);
});

test.only('encode/decode', async () => {
  const data = {
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

  console.log(inspect(head, undefined, 10));
  {
    expect(head[0]).toBeInstanceOf(Promise);

    const value = await head[0];
    expect(value.deferred).toBeInstanceOf(Promise);

    await expect(value.deferred).resolves.toBe(42);
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
