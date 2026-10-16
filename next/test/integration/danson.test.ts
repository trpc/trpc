import {
  createTrpcClient,
  httpLink,
  routerType,
  safe,
} from '@trpc12/trpc/client';
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
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
