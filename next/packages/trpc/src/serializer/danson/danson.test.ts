import {
  createTrpcClient,
  httpLink,
  routerType,
  safe,
} from '@trpc12/trpc/client';
import { createFetchHandler, error, initTrpc } from '@trpc12/trpc/server';
import { createSerializer, DansonError } from '@trpc12/trpc/serializer';
import { expect, test } from 'vite-plus/test';
import { z } from 'zod';

class Opaque {
  readonly secret = 1;
}

class Money {
  readonly cents: number;
  constructor(cents: number) {
    this.cents = cents;
  }
}

/** A type with no value: the marker is all there is. */
class Marker {}
/** A type the server can't write. */
class Unwritable {}
/** A type the client can't read. */
class Unreadable {}

const danson = createSerializer({
  types: {
    Money: {
      is: (v): v is Money => v instanceof Money,
      serialize: (v: Money) => v.cents,
      deserialize: (cents: number) => new Money(cents),
      input: false,
    },
    Marker: {
      is: (v): v is Marker => v instanceof Marker,
      serialize: () => undefined,
      deserialize: () => new Marker(),
    },
    Unwritable: {
      is: (v): v is Unwritable => v instanceof Unwritable,
      serialize: () => {
        throw new Error('cannot write');
      },
      deserialize: () => new Unwritable(),
    },
    Unreadable: {
      is: (v): v is Unreadable => v instanceof Unreadable,
      serialize: () => 1,
      deserialize: () => {
        throw new Error('cannot read');
      },
    },
  },
  maxDepth: 8,
});

let stopped = 0;

const t = initTrpc();
const router = {
  echo: t.procedure.input(z.unknown()).mutation((opts) => opts.input),
  find: t.procedure.input(z.unknown()).query((opts) => opts.input ?? 'none'),
  graph: t.procedure.query(() => {
    const root: Record<string, unknown> = { name: 'root', tags: ['$0', '$1'] };
    root['self'] = root;
    const list: unknown[] = ['$ref'];
    list.push(list);
    root['list'] = list;
    const map = new Map<string, unknown>();
    map.set('me', map);
    root['map'] = map;
    return root;
  }),
  money: t.procedure.query(() => new Money(250)),
  pattern: t.procedure.query(() => /a+b/gi),
  partial: t.procedure.query(() => ({
    unwritable: Promise.resolve(new Unwritable()),
    unreadable: Promise.resolve(new Unreadable()),
    fine: Promise.resolve('fine'),
    items: (async function* () {
      try {
        yield 1;
        yield new Unwritable();
        yield 3;
      } finally {
        stopped++;
      }
    })(),
    broken: new ReadableStream({
      start(controller) {
        controller.enqueue('first');
      },
      pull(controller) {
        controller.error(error({ code: 'CONFLICT', message: 'torn' }));
      },
    }),
  })),
  mixed: t.procedure.query(() => {
    const file = new File(['file bytes'], 'a.txt', { type: 'text/plain' });
    return {
      missing: Promise.reject(error({ code: 'NOT_FOUND', message: 'gone' })),
      crash: Promise.reject(new Error('internal detail')),
      items: (async function* () {
        yield 1;
        yield { file };
        throw error({ code: 'CONFLICT', message: 'stopped' });
      })(),
      done: (async function* () {
        yield 'a';
        return 'the end';
      })(),
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue('s1');
          controller.enqueue(new Money(5));
          controller.close();
        },
      }),
      file,
      again: file,
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'x/y' }),
    };
  }),
  later: t.procedure.query(() => ({
    loop: Promise.resolve().then(() => {
      const node: Record<string, unknown> = { at: 'deferred' };
      node['next'] = node;
      return node;
    }),
    opaque: Promise.resolve(new Opaque()),
  })),
};

function setup() {
  const handler = createFetchHandler({ router, serializer: danson });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [
      httpLink({
        url: 'http://localhost/trpc',
        serializer: danson,
        fetch: (input, init) =>
          handler.fetch(new Request(input as string, init as RequestInit)),
      }),
    ],
  });
  const post = (body: unknown) =>
    handler.fetch(
      new Request('http://localhost/trpc/echo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  return { client, post, handler };
}

test('cycles and `$`-strings survive the round trip, outputs and inputs', async () => {
  const app = setup();
  const graph = (await app.client.graph.query()) as Record<string, any>;
  expect(graph['name']).toBe('root');
  expect(graph['self']).toBe(graph);
  expect(graph['tags']).toEqual(['$0', '$1']);
  expect(graph['list'][0]).toBe('$ref');
  expect(graph['list'][1]).toBe(graph['list']);
  expect(graph['map'].get('me')).toBe(graph['map']);

  const cyclic: Record<string, unknown> = { label: '$label' };
  cyclic['again'] = cyclic;
  const echoed = (await app.client.echo.mutate(cyclic)) as Record<
    string,
    unknown
  >;
  expect(echoed['label']).toBe('$label');
  expect(echoed['again']).toBe(echoed);
  await app.handler.dispose();
});

test('a cycle inside a deferred value resolves; one that cannot be written rejects', async () => {
  const app = setup();
  const later = (await app.client.later.query()) as {
    loop: Promise<Record<string, unknown>>;
    opaque: Promise<unknown>;
  };
  const loop = await later.loop;
  expect(loop['at']).toBe('deferred');
  expect(loop['next']).toBe(loop);
  await expect(later.opaque).rejects.toBeDefined();
  await app.handler.dispose();
});

test('custom types: outputs only when input: false', async () => {
  const app = setup();
  expect(await app.client.money.query()).toEqual(new Money(250));
  const [, refused] = await safe(app.client.echo.mutate(new Money(1) as never));
  expect(refused).toMatchObject({
    code: 'PARSE_ERROR',
    message: 'No deserializer for type: Money',
  });
  const forged = await app.post({ json: { _: '$', type: 'Nope', value: 1 } });
  expect(await forged.json()).toMatchObject({
    json: { error: { message: 'No deserializer for type: Nope' } },
  });
  await app.handler.dispose();
});

test('inputs past maxDepth, with forbidden keys, or not JSON values are refused', async () => {
  const app = setup();
  let deep: unknown = 'leaf';
  for (let i = 0; i < 10; i++) deep = [deep];
  const tooDeep = await app.post({ json: deep });
  expect(await tooDeep.json()).toMatchObject({
    json: { error: { message: 'Max depth exceeded' } },
  });

  const proto = await app.handler.fetch(
    new Request('http://localhost/trpc/echo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"json":{"__proto__":{"admin":true}}}',
    }),
  );
  expect(await proto.json()).toMatchObject({
    json: { error: { message: 'Forbidden key: __proto__' } },
  });

  const ref = await app.post({ json: '$7', refs: { $7: { ok: true } } });
  expect(await ref.json()).toEqual({ json: { ok: true } });
  await app.handler.dispose();
});

test('`string` is a reserved type name', () => {
  const reserved = createSerializer({
    types: {
      string: {
        is: (v): v is string => typeof v === 'string',
        serialize: (v: string) => v,
        deserialize: (v: string) => v,
      },
    },
  });
  expect(() => reserved.serialize('x')).toThrow(DansonError);
});

test('a GET query carries refs in the URL, and reads the query string strictly or leniently', async () => {
  const app = setup();
  const cyclic: Record<string, unknown> = { q: 'x' };
  cyclic['self'] = cyclic;
  const found = (await app.client.find.query(cyclic)) as Record<
    string,
    unknown
  >;
  expect(found['self']).toBe(found);
  // A cycle below the root is a ref, sent as `refs=`; its repeats share it.
  const inner: Record<string, unknown> = { marker: new Marker() };
  inner['a'] = inner;
  inner['b'] = inner;
  const nested = (await app.client.find.query({ inner })) as {
    inner: Record<string, unknown>;
  };
  expect(nested.inner['a']).toBe(nested.inner);
  expect(nested.inner['b']).toBe(nested.inner);
  expect(nested.inner['marker']).toBeInstanceOf(Marker);

  const get = async (search: string) =>
    (await (
      await app.handler.fetch(
        new Request(`http://localhost/trpc/find${search}`),
      )
    ).json()) as unknown;
  const refs = encodeURIComponent(JSON.stringify({ $1: 'from refs' }));
  expect(await get(`?input=%22%241%22&refs=${refs}`)).toEqual({
    json: 'from refs',
  });
  expect(await get(`?refs=${refs}`)).toEqual({ json: 'none' });
  expect(await get('?input=1&input=2&refs=null&refs=3')).toEqual({ json: 1 });
  expect(await get('?other&input=%22a+b%22')).toEqual({ json: 'a b' });
  expect(await get('?%69nput=5')).toEqual({ json: 5 });
  expect(await get('?input=%22%E0%A4%A%22')).toEqual({ json: '\ufffd%A' });
  expect(await get('?input')).toMatchObject({
    json: { error: { code: 'PARSE_ERROR' } },
  });
  await app.handler.dispose();
});

test('deferred values: rejections, iterators that throw or return, streams, files and blobs', async () => {
  const app = setup();
  const out = (await app.client.mixed.query()) as Record<string, any>;
  await expect(out['missing']).rejects.toMatchObject({
    code: 'NOT_FOUND',
    message: 'gone',
  });
  await expect(out['crash']).rejects.toMatchObject({
    code: 'INTERNAL_SERVER_ERROR',
  });

  const seen: unknown[] = [];
  await expect(
    (async () => {
      for await (const item of out['items'] as AsyncIterable<unknown>) {
        seen.push(item);
      }
    })(),
  ).rejects.toMatchObject({ code: 'CONFLICT', message: 'stopped' });
  expect(seen[0]).toBe(1);
  const inner = (seen[1] as { file: File }).file;
  expect([inner.name, await inner.text()]).toEqual(['a.txt', 'file bytes']);

  const iterator = (out['done'] as AsyncIterable<unknown, unknown>)[
    Symbol.asyncIterator
  ]();
  expect(await iterator.next()).toEqual({ value: 'a', done: false });
  expect(await iterator.next()).toEqual({ value: 'the end', done: true });

  const read: unknown[] = [];
  for await (const chunk of out['stream'] as ReadableStream<unknown> &
    AsyncIterable<unknown>) {
    read.push(chunk);
  }
  expect(read).toEqual(['s1', new Money(5)]);

  expect(out['file']).toBeInstanceOf(File);
  expect(await (out['file'] as File).text()).toBe('file bytes');
  expect(await (out['again'] as File).text()).toBe('file bytes');
  const blob = out['blob'] as Blob;
  expect([blob.type, [...new Uint8Array(await blob.arrayBuffer())]]).toEqual([
    'x/y',
    [1, 2, 3],
  ]);
  await app.handler.dispose();
});

test('a streamed head the client cannot read fails the call instead of hanging', async () => {
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [
      httpLink({
        url: 'http://localhost/trpc',
        serializer: danson,
        fetch: async () =>
          new Response('{"json":{"_":"$","type":"Nope"}}\n[0,0,{"json":1}]\n', {
            headers: {
              'content-type': 'application/jsonl',
              'trpc-serializer': danson.name,
              'trpc-version': '12',
            },
          }),
      }),
    ],
  });
  const result = await Promise.race([
    safe(client.later.query()),
    new Promise((resolve) => setTimeout(() => resolve('hung'), 1000)),
  ]);
  expect(result).not.toBe('hung');
  expect((result as Awaited<ReturnType<typeof safe>>)[1]).toMatchObject({
    message: expect.stringContaining('No deserializer for type: Nope'),
  });
});

test('built-in types round-trip: headers, every typed array, search params, odd numbers and dates', async () => {
  const app = setup();
  const { client } = app;
  const typed = [
    new Int8Array([-1]),
    new Uint8Array([1]),
    new Uint8ClampedArray([2]),
    new Int16Array([-3]),
    new Uint16Array([4]),
    new Int32Array([-5]),
    new Uint32Array([6]),
    new Float32Array([0.5]),
    new Float64Array([0.25]),
    new BigInt64Array([-7n]),
    new BigUint64Array([8n]),
    new Float16Array([1.5]),
  ];
  // A Date with its own toJSON is sent as that toJSON says.
  const shifted = Object.assign(new Date(0), {
    toJSON: () => '2026-10-17T00:00:00.000Z',
  });
  const sent = {
    headers: new Headers([
      ['x-a', '1'],
      ['x-b', '2'],
    ]),
    typed,
    search: new URLSearchParams('a=1&a=2&b=x y'),
    numbers: [NaN, Infinity, -Infinity, -0],
    invalid: new Date(NaN),
    shifted,
  };
  const back = (await client.echo.mutate(sent)) as typeof sent;
  expect([...back.headers]).toEqual([
    ['x-a', '1'],
    ['x-b', '2'],
  ]);
  expect(back.typed).toEqual(typed);
  expect(back.typed.map((a) => a.constructor.name)).toEqual(
    typed.map((a) => a.constructor.name),
  );
  expect(back.search.getAll('a')).toEqual(['1', '2']);
  expect(back.search.get('b')).toBe('x y');
  expect(back.numbers).toEqual([NaN, Infinity, -Infinity, -0]);
  expect(Object.is(back.numbers[3], -0)).toBe(true);
  expect(back.invalid.getTime()).toBeNaN();
  expect(back.shifted).toEqual(new Date('2026-10-17T00:00:00.000Z'));

  // RegExps are outputs only.
  expect(await client.pattern.query()).toEqual(/a+b/gi);

  // A view that isn't a typed array has no built-in form.
  const [, view] = await safe(
    client.echo.mutate(new DataView(new ArrayBuffer(1))),
  );
  expect(view?.message).toContain('Do not know how to serialize');
  const forged = await app.post({
    json: { _: '$', type: 'TypedArray', value: ['Nope', [1]] },
  });
  expect(await forged.json()).toMatchObject({
    json: {
      error: {
        code: 'PARSE_ERROR',
        message: 'Unknown typed array: Nope',
      },
    },
  });
  await app.handler.dispose();
});

test("a deferred value the server can't write, or the client can't read, fails alone", async () => {
  const app = setup();
  const out = (await app.client.partial.query()) as Record<string, any>;
  // Masked on the server, which stops the source too.
  await expect(out['unwritable']).rejects.toMatchObject({
    code: 'INTERNAL_SERVER_ERROR',
  });
  await expect(out['unreadable']).rejects.toMatchObject({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Stream failed',
    cause: { message: 'deserialize failed', cause: { message: 'cannot read' } },
  });
  await expect(out['fine']).resolves.toBe('fine');
  const items: unknown[] = [];
  await expect(
    (async () => {
      for await (const item of out['items'] as AsyncIterable<unknown>) {
        items.push(item);
      }
    })(),
  ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  expect(items).toEqual([1]);
  expect(stopped).toBe(1);
  const reader = (out['broken'] as ReadableStream<unknown>).getReader();
  expect(await reader.read()).toEqual({ value: 'first', done: false });
  await expect(reader.read()).rejects.toMatchObject({
    code: 'CONFLICT',
    message: 'torn',
  });
  await app.handler.dispose();
});

test('forged streams: bad or missing file bytes, bare refs, unreadable frames and lines', async () => {
  const forged = (...lines: unknown[]) =>
    createTrpcClient({
      router: routerType<typeof router>(),
      links: [
        httpLink({
          url: 'http://localhost/trpc',
          serializer: danson,
          fetch: async () =>
            new Response(
              lines
                .map((l) => (typeof l === 'string' ? l : JSON.stringify(l)))
                .join('\n') + '\n',
              {
                headers: {
                  'content-type': 'application/jsonl',
                  'trpc-serializer': danson.name,
                  'trpc-version': '12',
                },
              },
            ),
        }),
      ],
    }).later.query() as Promise<any>;
  const file = (value: object) => ({ _: '$', type: 'File', value });
  const hi = (idx: number) => [
    [idx, 0, { json: 'aGk=' }],
    [idx, 2, {}],
  ];

  await expect(
    forged({ json: file({ stream: 0 }) }, [0, 0, { json: '@@@@' }], [0, 2, {}]),
  ).rejects.toMatchObject({
    code: 'NETWORK_ERROR',
    message: 'Malformed file bytes',
  });
  await expect(forged({ json: file({}) })).rejects.toMatchObject({
    message: 'Missing file bytes',
  });
  await expect(
    forged({ json: [file({ stream: 0 }), { _: '$', type: 'Nope' }] }, ...hi(0)),
  ).rejects.toMatchObject({ message: 'No deserializer for type: Nope' });

  // A ref without a name or type is a nameless, untyped file.
  const bare = await forged(
    {
      json: {
        file: file({ stream: 0 }),
        blob: { _: '$', type: 'Blob', value: { stream: 1 } },
      },
    },
    ...hi(0),
    ...hi(1),
  );
  expect([bare.file.name, bare.file.type, bare.blob.type]).toEqual([
    'blob',
    '',
    '',
  ]);
  expect(await bare.file.text()).toBe('hi');

  // Lines split anywhere, even inside a character, and blank lines.
  const bytes = new TextEncoder().encode('\n{"json":"été"}\n\n');
  const split = createTrpcClient({
    router: routerType<typeof router>(),
    links: [
      httpLink({
        url: 'http://localhost/trpc',
        serializer: danson,
        fetch: async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                for (const byte of bytes)
                  controller.enqueue(new Uint8Array([byte]));
                controller.close();
              },
            }),
            {
              headers: {
                'content-type': 'application/jsonl',
                'trpc-serializer': danson.name,
                'trpc-version': '12',
              },
            },
          ),
      }),
    ],
  });
  expect(await split.later.query()).toBe('été');

  // Lines that aren't JSON, or aren't chunks, fail what is still open.
  for (const line of ['{not json', '{"json":1}']) {
    const open = await forged(
      { json: { p: { _: '$', type: 'Promise', value: 0 } } },
      line,
    );
    await expect(open.p).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Stream failed',
    });
  }
});
