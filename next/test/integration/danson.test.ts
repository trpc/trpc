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

const danson = createSerializer({
  types: {
    Money: {
      is: (v): v is Money => v instanceof Money,
      serialize: (v: Money) => v.cents,
      deserialize: (cents: number) => new Money(cents),
      input: false,
    },
  },
  maxDepth: 8,
});

const t = initTrpc();
const router = {
  echo: t.procedure.input(z.unknown()).mutation(({ input }) => input),
  find: t.procedure.input(z.unknown()).query(({ input }) => input ?? 'none'),
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
  const { client, handler } = setup();
  const graph = (await client.graph.query()) as Record<string, any>;
  expect(graph['name']).toBe('root');
  expect(graph['self']).toBe(graph);
  expect(graph['tags']).toEqual(['$0', '$1']);
  expect(graph['list'][0]).toBe('$ref');
  expect(graph['list'][1]).toBe(graph['list']);
  expect(graph['map'].get('me')).toBe(graph['map']);

  const cyclic: Record<string, unknown> = { label: '$label' };
  cyclic['again'] = cyclic;
  const echoed = (await client.echo.mutate(cyclic)) as Record<string, unknown>;
  expect(echoed['label']).toBe('$label');
  expect(echoed['again']).toBe(echoed);
  await handler.dispose();
});

test('a cycle inside a deferred value resolves; one that cannot be written rejects', async () => {
  const { client, handler } = setup();
  const later = (await client.later.query()) as {
    loop: Promise<Record<string, unknown>>;
    opaque: Promise<unknown>;
  };
  const loop = await later.loop;
  expect(loop['at']).toBe('deferred');
  expect(loop['next']).toBe(loop);
  await expect(later.opaque).rejects.toBeDefined();
  await handler.dispose();
});

test('custom types: outputs only when input: false', async () => {
  const { client, post, handler } = setup();
  expect(await client.money.query()).toEqual(new Money(250));
  const [, refused] = await safe(client.echo.mutate(new Money(1) as never));
  expect(refused).toMatchObject({
    code: 'PARSE_ERROR',
    message: 'No deserializer for type: Money',
  });
  const forged = await post({ json: { _: '$', type: 'Nope', value: 1 } });
  expect(await forged.json()).toMatchObject({
    json: { error: { message: 'No deserializer for type: Nope' } },
  });
  await handler.dispose();
});

test('inputs past maxDepth, with forbidden keys, or not JSON values are refused', async () => {
  const { post, handler } = setup();
  let deep: unknown = 'leaf';
  for (let i = 0; i < 10; i++) deep = [deep];
  const tooDeep = await post({ json: deep });
  expect(await tooDeep.json()).toMatchObject({
    json: { error: { message: 'Max depth exceeded' } },
  });

  const proto = await handler.fetch(
    new Request('http://localhost/trpc/echo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"json":{"__proto__":{"admin":true}}}',
    }),
  );
  expect(await proto.json()).toMatchObject({
    json: { error: { message: 'Forbidden key: __proto__' } },
  });

  const ref = await post({ json: '$7', refs: { $7: { ok: true } } });
  expect(await ref.json()).toEqual({ json: { ok: true } });
  await handler.dispose();
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
  const { client, handler } = setup();
  const cyclic: Record<string, unknown> = { q: 'x' };
  cyclic['self'] = cyclic;
  const found = (await client.find.query(cyclic)) as Record<string, unknown>;
  expect(found['self']).toBe(found);

  const get = async (search: string) =>
    (await (
      await handler.fetch(new Request(`http://localhost/trpc/find${search}`))
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
  await handler.dispose();
});

test('deferred values: rejections, iterators that throw or return, streams, files and blobs', async () => {
  const { client, handler } = setup();
  const out = (await client.mixed.query()) as Record<string, any>;
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
  await handler.dispose();
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
