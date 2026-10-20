import { Effect, Stream } from 'effect';
import {
  createTrpcClient,
  httpLink,
  httpStreamLink,
  link,
  promiseLink,
  retryLink,
  routerType,
  safe,
  type HttpLinkOptions,
} from '@trpc12/trpc/client';
import { createEffectClient } from '@trpc12/trpc/effect';
import { createSerializer } from '@trpc12/trpc/serializer';
import { createFetchHandler, initTrpc, TrpcError } from '@trpc12/trpc/server';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';

const t = initTrpc();
let attempts = 0;
const router = {
  echo: t.procedure.input(z.unknown()).query((opts) => opts.input ?? 'none'),
  add: t.procedure
    .input(z.object({ a: z.number(), b: z.number() }))
    .mutation((opts) => opts.input.a + opts.input.b),
  when: t.procedure.input(z.date()).query((opts) => opts.input.getTime()),
  size: t.procedure
    .input(z.object({ file: z.instanceof(File) }))
    .mutation((opts) => opts.input.file.size),
  missing: t.procedure.query(() => {
    throw new TrpcError.NotFound({ message: 'No such post' });
  }),
  flaky: t.procedure.query(() => {
    attempts++;
    if (attempts < 3) throw new TrpcError({ code: 'SERVICE_UNAVAILABLE' });
    return attempts;
  }),
  raw: t.procedure.query(() => new Response('raw body', { status: 201 })),
  download: t.procedure.query(
    () => new File(['report'], 'report.csv', { type: 'text/csv' }),
  ),
  later: t.procedure.query(() => ({ now: 1, soon: Promise.resolve(2) })),
  ticks: t.procedure.subscription(async function* () {
    yield 1;
    yield 2;
  }),
};

const json = createFetchHandler({ router });
const danson = createSerializer();
const dansonHandler = createFetchHandler({ router, serializer: danson });

const requests: Request[] = [];
const via =
  (handler: { fetch: (request: Request) => Promise<Response> }) =>
  (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input as string, init);
    requests.push(request.clone());
    return handler.fetch(request);
  };

const clientWith = (opts: Partial<HttpLinkOptions> = {}) =>
  createTrpcClient({
    router: routerType<typeof router>(),
    links: [
      httpLink({ url: 'http://localhost/trpc/', fetch: via(json), ...opts }),
    ],
  });

test('queries are GETs with ?input=, mutations POSTs, in the JSON wire format', async () => {
  requests.length = 0;
  const client = clientWith({ headers: { 'x-link': 'link' } });
  expect(await client.echo.query({ b: 1, a: 2 })).toEqual({ a: 2, b: 1 });
  expect(await client.add.mutate({ a: 1, b: 2 })).toBe(3);
  const [get, post] = requests;
  expect(get!.method).toBe('GET');
  expect(new URL(get!.url).pathname).toBe('/trpc/echo');
  expect(new URL(get!.url).searchParams.get('input')).toBe('{"a":2,"b":1}');
  expect(get!.headers.get('trpc-version')).toBe('12');
  expect(get!.headers.get('x-link')).toBe('link');
  expect(post!.method).toBe('POST');
  expect(post!.headers.get('content-type')).toBe('application/json');
  expect(await post!.text()).toBe('{"json":{"a":1,"b":2}}');
});

test('headers merge lowest first, and long queries take a body', async () => {
  requests.length = 0;
  const client = clientWith({
    headers: () => ({ 'x-a': 'link', 'x-b': 'link' }),
    init: () => ({ headers: { 'x-a': 'init', 'x-c': 'init' } }),
    maxUrlLength: 40,
    longQuery: 'query',
  });
  await client.echo.query('x'.repeat(50), {
    headers: { 'x-b': 'call' },
  });
  const [request] = requests;
  expect(request!.method).toBe('QUERY');
  expect(Object.fromEntries(request!.headers)).toMatchObject({
    'x-a': 'link',
    'x-b': 'call',
    'x-c': 'init',
  });
  expect(
    await clientWith({ maxUrlLength: 40 }).echo.query('y'.repeat(50)),
  ).toBe('y'.repeat(50));
  expect(requests[1]!.method).toBe('POST');
});

test('errors: tRPC errors, pages in between, fetch failures and aborts', async () => {
  const [, missing] = await safe(clientWith().missing.query());
  expect(missing).toMatchObject({ code: 'NOT_FOUND', message: 'No such post' });

  const page = (status: number) =>
    clientWith({
      fetch: async () => new Response('<html>oops</html>', { status }),
    });
  const [, gateway] = await safe(page(502).echo.query(1));
  expect(gateway).toMatchObject({
    code: 'BAD_GATEWAY',
    message: 'Unexpected 502 response',
  });
  const [, teapot] = await safe(page(418).echo.query(1));
  expect(teapot).toMatchObject({ code: 'BAD_RESPONSE' });
  const [, garbled] = await safe(
    clientWith({ fetch: async () => new Response('{nope') }).echo.query(1),
  );
  expect(garbled).toMatchObject({
    code: 'BAD_RESPONSE',
    message: 'Invalid response body',
  });

  const [, down] = await safe(
    clientWith({
      fetch: () => Promise.reject(new TypeError('down')),
    }).echo.query(1),
  );
  expect(down).toMatchObject({ code: 'NETWORK_ERROR', message: 'down' });

  const controller = new AbortController();
  const pending = safe(
    clientWith({
      fetch: (_input, init) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          ),
        ),
    }).echo.query(1, { signal: controller.signal }),
  );
  controller.abort();
  const [, aborted] = await pending;
  expect(aborted).toMatchObject({ code: 'CLIENT_CLOSED_REQUEST' });
});

test('an output that streams fails, pointing at httpStreamLink', async () => {
  const [, error] = await safe(clientWith().later.query());
  expect(error).toMatchObject({
    code: 'BAD_RESPONSE',
    message: expect.stringContaining('use httpStreamLink'),
  });
  const stream = createTrpcClient({
    router: routerType<typeof router>(),
    links: [httpStreamLink({ url: 'http://localhost/trpc', fetch: via(json) })],
  });
  const later = await stream.later.query();
  expect(await later.soon).toBe(2);
});

test("batch and binary are httpStreamLink's options, a type error here", () => {
  // @ts-expect-error batching is httpStreamLink's
  httpLink({ url: 'http://localhost/trpc', batch: true });
  // @ts-expect-error binary frames are httpStreamLink's
  httpLink({ url: 'http://localhost/trpc', binary: true });
});

test('no subscriptions: the type has no .subscribe(), a call fails', async () => {
  const client = clientWith();
  expectTypeOf(client.ticks).not.toHaveProperty('subscribe');
  const untyped = client.ticks as unknown as {
    subscribe: () => AsyncIterable<unknown>;
  };
  const [, error] = await safe(
    (async () => {
      for await (const _ of untyped.subscribe()) break;
    })(),
  );
  expect(error).toMatchObject({ code: 'METHOD_NOT_SUPPORTED' });
});

test('a serializer keeps types and sends files as multipart', async () => {
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [
      httpLink({
        url: 'http://localhost/trpc',
        fetch: via(dansonHandler),
        serializer: danson,
      }),
    ],
  });
  expect(await client.when.query(new Date(5))).toBe(5);
  expect(await client.size.mutate({ file: new File(['abc'], 'a.txt') })).toBe(
    3,
  );
  const [, mismatch] = await safe(
    clientWith({ fetch: via(dansonHandler) }).echo.query(1),
  );
  expect(mismatch).toMatchObject({ code: 'UNSUPPORTED_PROTOCOL' });
  const [, noFiles] = await safe(
    clientWith().size.mutate({ file: new File(['abc'], 'a.txt') }),
  );
  expect(noFiles).toMatchObject({ code: 'BAD_REQUEST' });
});

test('raw responses, file outputs and onResponse', async () => {
  const seen: number[] = [];
  const client = clientWith();
  const raw = await client.raw.query(undefined, {
    onResponse: (res) => seen.push(res.status),
  });
  expect(raw).toBeInstanceOf(Response);
  expect(await (raw as Response).text()).toBe('raw body');
  expect(seen).toEqual([201]);
  const file = (await client.download.query()) as File;
  expect([file.name, file.type, await file.text()]).toEqual([
    'report.csv',
    'text/csv',
    'report',
  ]);
});

test('Promise links and Effect links share a chain, in either client', async () => {
  const order: string[] = [];
  const tag = promiseLink((args) => {
    const { op } = args;
    order.push(`promise ${op.path}`);
    return args.next({
      ...op,
      context: { ...op.context, headers: { 'x-tag': 'tagged' } },
    });
  });
  const log = link((args) =>
    args
      .next(args.op)
      .pipe(
        Stream.tap(() =>
          Effect.sync(() => order.push(`effect ${args.op.path}`)),
        ),
      ),
  );
  attempts = 0;
  requests.length = 0;
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [
      log,
      retryLink({ delay: () => 0 }),
      tag,
      httpLink({ url: 'http://localhost/trpc', fetch: via(json) }),
    ],
  });
  expect(await client.flaky.query()).toBe(3);
  expect(order).toEqual([
    'promise flaky',
    'promise flaky',
    'promise flaky',
    'effect flaky',
  ]);
  expect(requests.map((r) => r.headers.get('x-tag'))).toEqual([
    'tagged',
    'tagged',
    'tagged',
  ]);

  const effect = createEffectClient({
    router: routerType<typeof router>(),
    links: [tag, httpLink({ url: 'http://localhost/trpc', fetch: via(json) })],
  });
  expect(await Effect.runPromise(effect.add.mutate({ a: 2, b: 2 }))).toBe(4);
  const missing = await Effect.runPromise(Effect.flip(effect.missing.query()));
  expect(missing).toMatchObject({ code: 'NOT_FOUND' });

  const streamed = createTrpcClient({
    router: routerType<typeof router>(),
    links: [
      tag,
      httpStreamLink({ url: 'http://localhost/trpc', fetch: via(json) }),
    ],
  });
  const ticks: unknown[] = [];
  for await (const n of streamed.ticks.subscribe()) ticks.push(n);
  expect(ticks).toEqual([1, 2]);

  const effectStream = createEffectClient({
    router: routerType<typeof router>(),
    links: [
      tag,
      httpStreamLink({ url: 'http://localhost/trpc', fetch: via(json) }),
    ],
  });
  const collected = await Effect.runPromise(
    Stream.runCollect(effectStream.ticks.subscribe()),
  );
  expect([...collected]).toEqual([1, 2]);
});

test('a Promise chain without a last link, or with an unmarked Effect link, fails', async () => {
  const pass = promiseLink((args) => args.next(args.op));
  const [, noLast] = await safe(
    createTrpcClient({
      router: routerType<typeof router>(),
      links: [pass] as never,
    }).echo.query(1),
  );
  expect(noLast).toMatchObject({
    code: 'CLIENT_ERROR',
    message: 'The last link must send the request (e.g. httpLink)',
  });
  const [, unmarked] = await safe(
    createTrpcClient({
      router: routerType<typeof router>(),
      links: [(() => Stream.make(1)) as never],
    }).echo.query(1),
  );
  expect(unmarked).toMatchObject({ code: 'CLIENT_ERROR' });
  expect(String((unmarked as Error).cause ?? unmarked)).toContain(
    'make Effect links with link()',
  );
});

test("requests: init's next, byte stream and Blob bodies, bodiless responses", async () => {
  const inits: RequestInit[] = [];
  const empty = clientWith({
    init: { next: { revalidate: 60 } },
    fetch: async (_url, init) => {
      inits.push(init);
      return new Response(null, { status: 204 });
    },
  });
  expect(
    await empty.echo.query(1, { init: { next: { tags: ['posts'] } } }),
  ).toBeUndefined();
  expect((inits[0] as { next?: unknown }).next).toEqual({
    revalidate: 60,
    tags: ['posts'],
  });

  await empty.echo.query(new ReadableStream<Uint8Array>() as never);
  expect(inits[1]).toMatchObject({ method: 'POST', duplex: 'half' });
  expect(new Headers(inits[1]!.headers).get('content-type')).toBe(
    'application/octet-stream',
  );

  const files = createTrpcClient({
    router: routerType<typeof router>(),
    links: [
      httpLink({
        url: 'http://localhost/trpc',
        serializer: danson,
        fetch: async (_url, init) => {
          inits.push(init);
          return new Response(null, { status: 204 });
        },
      }),
    ],
  });
  await files.echo.query({ blob: new Blob(['ab']) });
  const part = (inits[2]!.body as FormData).get('0') as File;
  expect([part.name, await part.text()]).toEqual(['blob', 'ab']);

  const [, offline] = await safe(
    clientWith({ fetch: () => Promise.reject('offline') }).echo.query(1),
  );
  expect(offline).toMatchObject({
    code: 'NETWORK_ERROR',
    message: 'Network error',
  });
  const [, notTrpc] = await safe(
    clientWith({
      fetch: async () => new Response('{"json":{"nope":1}}', { status: 500 }),
    }).echo.query(1),
  );
  expect(notTrpc).toMatchObject({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Unexpected 500 response',
  });
});
