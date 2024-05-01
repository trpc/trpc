/*
given {
    0: {
        foo: "bar",
        deferred: Promise<number>,
    }
    1: AsyncIterable<number>,
}
*/

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
  chunkId: number,
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

type Serialize = <T>(value: T) => T;

interface CreateStreamOptions {
  serialize?: Serialize;
  data: Record<number, unknown>;
}
function createBatchStream(opts: CreateStreamOptions) {
  const { serialize = (it) => it, data } = opts;
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
        controller.enqueue([
          idx,
          PromiseStatus.FULFILLED,
          serialize(getValue(it)),
        ]);
      })
      .catch((err) => {
        controller.enqueue([idx, PromiseStatus.REJECTED, serialize(err)]);
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
          controller.enqueue([
            idx,
            IterableStatus.VALUE,
            serialize(getValue(item)),
          ]);
        }
        controller.enqueue([idx, IterableStatus.DONE]);
      } catch (err) {
        controller.enqueue([idx, IterableStatus.ERROR, serialize(err)]);
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
      newObj[key] = serialize(item);
    }
    return [[newObj], ...asyncValues];
  }

  const head: Head = {};
  for (const [key, value] of Object.entries(data)) {
    head[key as unknown as number] = getValue(value);
  }

  return [head, stream] as const;
}
function createJsonBatchStream(opts: CreateStreamOptions) {
  const [sourceHead, sourceStream] = createBatchStream(opts);

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

test('encoder - superjson', async () => {
  const [head, stream] = createBatchStream({
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
  expect(chunks).toMatchInlineSnapshot(`
    Array [
      Array [
        0,
        0,
        Object {
          "json": Array [
            Array [
              42,
            ],
          ],
        },
      ],
      Array [
        1,
        0,
        Object {
          "json": Array [
            Array [
              0,
            ],
            Array [
              null,
              1,
              2,
            ],
          ],
        },
      ],
      Array [
        2,
        0,
        Object {
          "json": Array [
            Array [
              1,
            ],
          ],
        },
      ],
      Array [
        2,
        0,
        Object {
          "json": Array [
            Array [
              2,
            ],
          ],
        },
      ],
      Array [
        2,
        0,
        Object {
          "json": Array [
            Array [
              3,
            ],
          ],
        },
      ],
      Array [
        2,
        1,
      ],
    ]
  `);
});

test('encoder - json', async () => {
  const stream = createJsonBatchStream({
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
  console.log({ chunks });
  console.log(chunks.join(''));

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
