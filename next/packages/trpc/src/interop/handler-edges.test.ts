import {
  createTRPCUntypedClient,
  httpBatchStreamLink,
  httpLink,
} from '@trpc/client';
import { Effect, Stream } from 'effect';
import { HttpServerResponse } from 'effect/http';
import superjson from 'superjson';
import { createV11Handler, type V11HandlerOptions } from '@trpc12/trpc/interop';
import { error, initTrpc } from '@trpc12/trpc/server';
import { expect, test } from 'vite-plus/test';
import { z } from 'zod';

const t = initTrpc<{ ctx: { user: string } }>();

const router = {
  greet: t.procedure
    .input(z.object({ name: z.string() }).optional())
    .query((opts) => `hello ${opts.input?.name ?? opts.ctx.user}`),
  add: t.procedure
    .input(z.unknown())
    .mutation((opts) => opts.input ?? 'nothing'),
  tagged: t.procedure.input(z.string()).query((opts) => {
    opts.response.headers.set('x-tag', opts.input);
    return opts.input;
  }),
  deferred: t.procedure
    .input(z.enum(['defined', 'unexpected']))
    .query((opts) => ({
      title: 'Report',
      total:
        opts.input === 'defined'
          ? Promise.reject(error({ code: 'CONFLICT', message: 'Recount' }))
          : Promise.reject(new Error('secret')),
    })),
  raw: t.procedure.query((opts) => {
    opts.response.headers.append('set-cookie', 'session=1');
    opts.response.headers.set('x-from-handle', 'yes');
    return HttpServerResponse.text('by hand', {
      headers: { 'x-from-response': 'yes' },
    });
  }),
  events: t.procedure
    .use((opts) => {
      opts.response.headers.append('set-cookie', 'seen=1');
      return opts.next();
    })
    .input(z.object({ from: z.number() }).optional())
    .subscription(async function* (opts) {
      yield opts.input?.from ?? 1;
    }),
  slow: t.procedure.subscription(() =>
    Stream.fromEffect(Effect.as(Effect.sleep('60 millis'), 'late')),
  ),
};

type Options = Partial<V11HandlerOptions<typeof router>>;

const make = (extra: Options = {}) =>
  createV11Handler({
    router,
    createContext: () => ({ user: 'ada' }),
    exposeUnexpectedErrors: false,
    ...extra,
  });

const call = (
  handler: { fetch: (r: Request) => Promise<Response> },
  path: string,
  init?: RequestInit,
) => handler.fetch(new Request(`http://localhost${path}`, init));

const json = (body: string, headers: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body,
});

test('inputs that cannot be read are refused before any call runs', async () => {
  const handler = make();
  const badJson = await call(handler, '/trpc/greet?input={nope');
  expect(badJson.status).toBe(400);
  expect(await badJson.json()).toMatchObject({
    error: { message: 'Invalid JSON', data: { code: 'PARSE_ERROR' } },
  });

  const empty = await call(handler, '/trpc/add', json(''));
  expect(await empty.json()).toEqual({ result: { data: 'nothing' } });

  const text = await call(handler, '/trpc/add', {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: 'hi',
  });
  expect(text.status).toBe(415);
  expect(await text.json()).toMatchObject({
    error: { message: 'Unsupported content-type "text/plain"' },
  });

  const broken = await call(handler, '/trpc/add', {
    method: 'POST',
    headers: { 'content-type': 'multipart/form-data; boundary=x' },
    body: 'not multipart',
  });
  expect(broken.status).toBe(400);
  expect(await broken.json()).toMatchObject({
    error: { message: 'Invalid multipart body' },
  });

  const batchedForm = await call(handler, '/trpc/add,add?batch=1', {
    method: 'POST',
    body: new FormData(),
  });
  expect(batchedForm.status).toBe(400);
  expect(await batchedForm.json()).toMatchObject([
    {
      error: {
        message: expect.stringMatching(/requests cannot be batched$/),
      },
    },
    {},
  ]);
  await handler.dispose();
});

test('batches: no input, a non-object input, mixed types, subscriptions', async () => {
  const handler = make();
  const none = await call(handler, '/trpc/greet,greet?batch=1');
  expect(await none.json()).toEqual([
    { result: { data: 'hello ada' } },
    { result: { data: 'hello ada' } },
  ]);

  const scalar = await call(handler, '/trpc/greet,greet?batch=1&input=5');
  expect(await scalar.json()).toMatchObject([
    {
      error: {
        message: '"input" needs to be an object when doing a batch call',
      },
    },
    {},
  ]);

  const mixed = await call(handler, '/trpc/greet,add?batch=1', json('{}'));
  expect(await mixed.json()).toMatchObject([
    {
      error: {
        message: 'Cannot mix procedure types in call: query, mutation',
      },
    },
    {},
  ]);

  const subs = await call(handler, '/trpc/events,events?batch=1');
  expect(await subs.json()).toMatchObject([
    { error: { message: 'Subscriptions cannot be batched' } },
    { error: { message: 'Subscriptions cannot be batched' } },
  ]);

  const tags = await call(
    handler,
    `/trpc/tagged,tagged?batch=1&input=${encodeURIComponent('{"0":"a","1":"b"}')}`,
  );
  expect(tags.headers.get('x-tag')).toBe('b');
  await handler.dispose();
});

test('paths outside the endpoint are 404, one error per batched call', async () => {
  const handler = make({ endpoint: '/legacy/' });
  const single = await call(handler, '/trpc/greet');
  expect(single.status).toBe(404);
  expect(await single.json()).toMatchObject({
    error: { message: 'Not found: /trpc/greet' },
  });
  const batch = await call(handler, '/elsewhere?batch=1');
  expect(await batch.json()).toMatchObject([
    { error: { data: { code: 'NOT_FOUND' } } },
  ]);
  expect(await (await call(handler, '/legacy/greet')).json()).toEqual({
    result: { data: 'hello ada' },
  });
  await handler.dispose();
});

test('a settled promise that rejects is the call’s error, defined or masked', async () => {
  const handler = make();
  const client = createTRPCUntypedClient<any>({
    links: [
      httpLink({
        url: 'http://localhost/trpc',
        fetch: (input, init) =>
          handler.fetch(new Request(input as string, init as RequestInit)),
      }),
    ],
  });
  await expect(client.query('deferred', 'defined')).rejects.toMatchObject({
    message: 'Recount',
    data: { code: 'CONFLICT' },
  });
  await expect(client.query('deferred', 'unexpected')).rejects.toMatchObject({
    message: 'Internal server error',
  });
  await handler.dispose();
});

test('a deferred value that rejects in a JSON Lines batch is that value’s error', async () => {
  const handler = make();
  const client = createTRPCUntypedClient<any>({
    links: [
      httpBatchStreamLink({
        url: 'http://localhost/trpc',
        fetch: (input, init) =>
          handler.fetch(new Request(input as string, init as RequestInit)),
      }),
    ],
  });
  const report = (await client.query('deferred', 'defined')) as {
    title: string;
    total: Promise<number>;
  };
  expect(report.title).toBe('Report');
  await expect(report.total).rejects.toMatchObject({ message: 'Recount' });

  const accepted = await call(
    handler,
    `/trpc/greet?batch=1&input=${encodeURIComponent('{"0":{"name":"jsonl"}}')}`,
    { headers: { accept: 'text/html, application/jsonl' } },
  );
  expect(await accepted.text()).toContain('hello jsonl');
  await handler.dispose();
});

test('a returned HttpServerResponse gains the handle’s headers and cookies', async () => {
  const handler = make();
  const res = await call(handler, '/trpc/raw');
  expect(await res.text()).toBe('by hand');
  expect(res.headers.get('x-from-response')).toBe('yes');
  expect(res.headers.get('x-from-handle')).toBe('yes');
  expect(res.headers.getSetCookie()).toEqual(['session=1']);
  await handler.dispose();
});

test('subscriptions: invalid input is an error event, cookies set, pings optional', async () => {
  const quiet = make({ sse: { pingMs: false } });
  const invalid = await call(
    quiet,
    `/trpc/events?input=${encodeURIComponent('{"from":"x"}')}`,
  );
  const text = await invalid.text();
  expect(text).toContain('event: connected');
  expect(text).toContain('event: serialized-error');
  expect(text).toContain('"code":"BAD_REQUEST"');

  const ok = await call(quiet, '/trpc/events');
  expect(ok.headers.getSetCookie()).toEqual(['seen=1']);
  expect(await ok.text()).toContain('data: 1\n');
  await quiet.dispose();

  const chatty = make({ sse: { pingMs: 10 } });
  const slow = await (await call(chatty, '/trpc/slow')).text();
  expect(slow).toContain('event: ping');
  expect(slow).toContain('data: "late"');
  await chatty.dispose();
});

test('createContext errors fail every call, with their code when they have one', async () => {
  const defined = make({
    createContext: () => {
      throw error({ code: 'UNAUTHORIZED', message: 'Who are you?' });
    },
  });
  const res = await call(defined, '/trpc/greet');
  expect(res.status).toBe(401);
  expect(await res.json()).toMatchObject({
    error: { message: 'Who are you?' },
  });
  await defined.dispose();

  const unexpected = make({
    createContext: () => {
      throw new Error('db down');
    },
  });
  const masked = await call(unexpected, '/trpc/greet');
  expect(masked.status).toBe(500);
  expect(await masked.json()).toMatchObject({
    error: { message: 'Internal server error' },
  });
  await unexpected.dispose();
});

test('a transformer split into input and output, and one that cannot read', async () => {
  const split = make({
    transformer: { input: superjson, output: superjson },
  });
  const res = await call(
    split,
    '/trpc/add',
    json(JSON.stringify(superjson.serialize({ at: new Date(0) }))),
  );
  expect(
    superjson.deserialize(
      ((await res.json()) as { result: { data: never } }).result.data,
    ),
  ).toEqual({ at: new Date(0) });
  await split.dispose();

  const failing = (cause: unknown) =>
    make({
      transformer: {
        serialize: (v: unknown) => v,
        deserialize: () => {
          throw cause;
        },
      },
    });
  for (const [cause, message] of [
    [new Error('bad shape'), 'bad shape'],
    ['nope', 'Invalid input'],
  ] as const) {
    const handler = failing(cause);
    const bad = await call(handler, '/trpc/add', json('{}'));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: { message } });
    await handler.dispose();
  }
});

test('middleware wraps the app, and fetch passes the platform on', async () => {
  const seen: string[] = [];
  const handler = createV11Handler<typeof router, { user: string }>({
    router,
    createContext: (opts) => ({ user: opts.platform.user }),
    middleware: [
      (app) =>
        Effect.map(app, (res) => {
          seen.push(String(res.status));
          return HttpServerResponse.setHeader(res, 'x-wrapped', '1');
        }),
    ],
  });
  const res = await handler.fetch(new Request('http://localhost/trpc/greet'), {
    user: 'grace',
  });
  expect(res.headers.get('x-wrapped')).toBe('1');
  expect(await res.json()).toEqual({ result: { data: 'hello grace' } });
  expect(seen).toEqual(['200']);
  await handler.dispose();
});
