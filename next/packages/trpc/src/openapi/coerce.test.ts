import { createTrpcClient } from '@trpc12/trpc/client';
import { toContract } from '@trpc12/trpc/contract';
import {
  createOpenApiHandler,
  openapi,
  openApiLink,
} from '@trpc12/trpc/openapi';
import { type AnyRouter, initTrpc } from '@trpc12/trpc/server';
import { expect, test } from 'vite-plus/test';
import { z } from 'zod';

const t = initTrpc().concat(openapi());

const Tag = z
  .object({ name: z.string(), weight: z.number() })
  .meta({ id: 'Tag' });

const Input = z.object({
  int: z.number().int(),
  flag: z.boolean(),
  off: z.boolean(),
  nil: z.null(),
  empty: z.null(),
  level: z.union([z.literal(1), z.literal(2)]),
  on: z.literal(true),
  maybe: z.number().nullable(),
  both: z.intersection(
    z.object({ a: z.number() }),
    z.object({ b: z.boolean() }),
  ),
  pair: z.tuple([z.number(), z.boolean()]),
  scores: z.record(z.string(), z.number()),
  tag: Tag,
  either: z.union([z.number().int(), z.string()]),
  big: z.number(),
  small: z.number(),
  pick: z.union([z.boolean(), z.null(), z.object({ k: z.number() })]),
  objectish: z.union([z.null(), z.object({ k: z.number() })]),
  list: z.union([z.array(z.number()), z.string()]),
  text: z.string(),
});

const handler = createOpenApiHandler({
  router: {
    echo: t.procedure
      .meta({ route: { method: 'GET', path: '/echo' } })
      .input(Input)
      .query((opts) => opts.input),
    form: t.procedure
      .meta({ route: { method: 'POST', path: '/form' } })
      .input(
        z.object({ count: z.number(), done: z.boolean(), notes: z.string() }),
      )
      .mutation((opts) => opts.input),
  },
});
const api = (path: string, init?: RequestInit) =>
  handler.fetch(new Request(`http://localhost/api${path}`, init));

test('query strings are coerced through refs, allOf, anyOf, tuples and records (18 (b))', async () => {
  const query = [
    'int=3',
    'flag=on',
    'off=off',
    'nil=null',
    'empty=',
    'level=2',
    'on=true',
    'maybe=null',
    'both[a]=1',
    'both[b]=true',
    'pair[]=1',
    'pair[]=false',
    'scores[x]=1.5',
    'tag[name]=a',
    'tag[weight]=2',
    'either=x',
    'big=1e3',
    'small=.5',
    'pick=null',
    'objectish[k]=4',
    'list=7',
    'text=42',
  ].join('&');
  const res = await api(`/echo?${query}`);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({
    int: 3,
    flag: true,
    off: false,
    nil: null,
    empty: null,
    level: 2,
    on: true,
    maybe: null,
    both: { a: 1, b: true },
    pair: [1, false],
    scores: { x: 1.5 },
    tag: { name: 'a', weight: 2 },
    // The first branch the coerced value matches wins.
    either: 'x',
    big: 1000,
    small: 0.5,
    pick: null,
    objectish: { k: 4 },
    list: [7],
    text: '42',
  });

  const integer = await api(`/echo?${query.replace('either=x', 'either=5')}`);
  expect(await integer.json()).toMatchObject({ either: 5 });

  // Values the schema doesn't describe are left for validation to report.
  const invalid = await api(`/echo?${query.replace('int=3', 'int=3.5')}`);
  expect(invalid.status).toBe(400);
  expect(await invalid.json()).toMatchObject({
    code: 'BAD_REQUEST',
    data: { issues: [{ path: ['int'] }] },
  });
});

test('form fields are coerced one key at a time (18 (b))', async () => {
  const res = await api('/form', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'count=3&done=on&notes=7',
  });
  expect(await res.json()).toEqual({ count: 3, done: true, notes: '7' });
});

test('openApiLink sends nulls, dates and lists of objects in bracket notation', async () => {
  const r = {
    find: t.procedure
      .meta({ route: { method: 'GET', path: '/find' } })
      .input(
        z.object({
          at: z.string(),
          none: z.null(),
          items: z.array(z.object({ id: z.number(), name: z.string() })),
        }),
      )
      .query((opts) => opts.input),
  } satisfies AnyRouter;
  const h = createOpenApiHandler({ router: r });
  const urls: string[] = [];
  const client = createTrpcClient({
    router: r,
    links: [
      openApiLink({
        url: 'http://localhost',
        contract: toContract(r),
        fetch: (url, init) => {
          const request = new Request(url, init);
          urls.push(decodeURIComponent(request.url));
          return h.fetch(request);
        },
      }),
    ],
  });
  const input: Parameters<typeof client.find.query>[0] = {
    at: new Date(0) as unknown as string,
    none: null,
    items: [
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
    ],
  };
  expect(await client.find.query(input)).toEqual({
    ...input,
    at: '1970-01-01T00:00:00.000Z',
  });
  expect(urls[0]).toContain('items[0][id]=1&items[0][name]=a&items[1][id]=2');
  expect(urls[0]).toContain('none=&');
});
