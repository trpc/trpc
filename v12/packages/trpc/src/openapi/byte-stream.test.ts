import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { NodeHttpServer } from '@effect/platform-node';
import { Effect, Exit, Layer, Option, Schema, Scope, Stream } from 'effect';
import { createTrpcClient, routerType } from '@trpc12/trpc/client';
import { experimental_toContract } from '@trpc12/trpc/contract';
import { serve } from '@trpc12/trpc/http';
import {
  experimental_createOpenApiHandler,
  experimental_openapi,
  experimental_openApiLink,
} from '@trpc12/trpc/openapi';
import {
  experimental_byteStream,
  initTrpc,
  type experimental_ByteStream,
} from '@trpc12/trpc/server';
import { expect, test } from 'vite-plus/test';
import { z } from 'zod';

const t = initTrpc().concat(experimental_openapi());

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const text = (bytes: experimental_ByteStream) =>
  bytes.pipe(
    Stream.decodeText(),
    Stream.runFold(
      () => '',
      (all, part) => all + part,
    ),
  );

const router = t.router({
  upload: t.procedure
    .meta({ route: { method: 'POST', path: '/uploads' } })
    .input(experimental_byteStream())
    .mutation((opts) => text(opts.input)),
  first: t.procedure
    .meta({ route: { method: 'POST', path: '/first' } })
    .input(experimental_byteStream())
    .mutation((opts) =>
      Effect.map(Stream.runHead(opts.input), (chunk) =>
        decoder.decode(Option.getOrThrow(chunk)),
      ),
    ),
  video: t.procedure
    .meta({
      route: {
        method: 'PUT',
        path: '/videos/{id}',
        inputStructure: 'detailed',
      },
    })
    .input(
      Schema.Struct({
        params: Schema.Struct({ id: Schema.String }),
        body: experimental_byteStream({ maxBytes: 8 }),
      }),
    )
    .mutation((opts) =>
      Effect.map(text(opts.input.body), (body) => ({
        id: opts.input.params.id,
        body,
      })),
    ),
  json: t.procedure
    .meta({ route: { method: 'POST', path: '/json' } })
    .input(z.object({ n: z.number() }))
    .mutation((opts) => opts.input),
});

const octet: Record<string, string> = {
  'content-type': 'application/octet-stream',
};

const streamOf = (...chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });

const send = (
  handler: { fetch: (request: Request) => Promise<Response> },
  method: string,
  path: string,
  body: BodyInit,
  headers: Record<string, string> = octet,
) =>
  handler.fetch(
    new Request(`http://localhost/api${path}`, {
      method,
      headers,
      body,
      duplex: 'half',
    } as RequestInit),
  );

test('a byte stream input is the application/octet-stream body', async () => {
  await using handler = experimental_createOpenApiHandler({ router });
  const res = await send(handler, 'POST', '/uploads', streamOf('hel', 'lo'));
  expect(res.status).toBe(200);
  expect(await res.json()).toBe('hello');
});

test('the resolver reads the body as it arrives, unbuffered', async () => {
  await using handler = experimental_createOpenApiHandler({ router });
  // Never closed: buffering the body first would never answer.
  const open = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('first chunk'));
    },
  });
  const res = await send(handler, 'POST', '/first', open);
  expect(await res.json()).toBe('first chunk');
});

test("a detailed input's byte stream body takes path params beside it", async () => {
  await using handler = experimental_createOpenApiHandler({ router });
  const res = await send(handler, 'PUT', '/videos/v%201', streamOf('frames'));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ id: 'v 1', body: 'frames' });

  const big = await send(
    handler,
    'PUT',
    '/videos/2',
    streamOf('too many bytes'),
  );
  expect(big.status).toBe(413);
  expect(await big.json()).toMatchObject({
    code: 'PAYLOAD_TOO_LARGE',
    message: 'The byte stream is over 8 bytes',
  });
});

test('maxBodySize leaves a byte stream to its maxBytes', async () => {
  await using handler = experimental_createOpenApiHandler({
    router,
    maxBodySize: 4,
  });
  const res = await send(handler, 'POST', '/uploads', streamOf('over four'));
  expect(await res.json()).toBe('over four');
});

test('a byte stream route takes only application/octet-stream, and other routes refuse it', async () => {
  await using handler = experimental_createOpenApiHandler({ router });
  const json = await send(handler, 'POST', '/uploads', '"hello"', {
    'content-type': 'application/json',
  });
  expect(json.status).toBe(415);
  expect(await json.json()).toMatchObject({
    code: 'UNSUPPORTED_MEDIA_TYPE',
    message:
      "This route's body is a byte stream: send application/octet-stream",
  });

  const octetToJson = await send(handler, 'POST', '/json', streamOf('{}'));
  expect(octetToJson.status).toBe(415);
});

test('a byte stream from another origin passes the CSRF guard, which only form bodies need', async () => {
  await using handler = experimental_createOpenApiHandler({ router });
  const res = await send(handler, 'POST', '/uploads', streamOf('cors'), {
    ...octet,
    origin: 'https://app.example.com',
    'sec-fetch-site': 'cross-site',
  });
  expect(await res.json()).toBe('cors');
});

test("a byte stream's JSON Schema is binary, so a contract describes it", () => {
  const contract = experimental_toContract(router);
  expect(contract.procedures['upload']?.input).toEqual({
    type: 'string',
    format: 'binary',
    contentMediaType: 'application/octet-stream',
  });
});

test('a byte stream has no JSON form to decode or encode', async () => {
  const json = Schema.toCodecJson(experimental_byteStream());
  const decoded = await Effect.runPromiseExit(
    Schema.decodeUnknownEffect(json)('bytes'),
  );
  const encoded = await Effect.runPromiseExit(
    Schema.encodeUnknownEffect(json)(Stream.empty),
  );
  for (const exit of [decoded, encoded]) {
    expect(String(exit)).toContain('A byte stream has no JSON form');
  }
});

test('a handler built from a contract streams the body too', async () => {
  await using handler = experimental_createOpenApiHandler({
    router,
    contract: experimental_toContract(router),
  });
  const res = await send(handler, 'POST', '/uploads', streamOf('contract'));
  expect(await res.json()).toBe('contract');
});

const clientFor = (
  url: string,
  fetch?: (url: string, init: RequestInit) => Promise<Response>,
) =>
  createTrpcClient({
    router: routerType<typeof router>(),
    links: [
      experimental_openApiLink({
        url,
        contract: experimental_toContract(router),
        ...(fetch ? { fetch } : {}),
      }),
    ],
  });

test('experimental_openApiLink sends a ReadableStream input as the application/octet-stream body', async () => {
  await using handler = experimental_createOpenApiHandler({ router });
  const sent: Request[] = [];
  const client = clientFor('http://localhost', (url, init) => {
    const request = new Request(url, init);
    sent.push(request);
    return handler.fetch(request);
  });

  expect(await client.upload.mutate(streamOf('hel', 'lo'))).toBe('hello');
  expect(
    await client.video.mutate({
      params: { id: 'v 1' },
      body: streamOf('frames'),
    }),
  ).toEqual({ id: 'v 1', body: 'frames' });
  expect(
    sent.map((request) => [
      request.method,
      new URL(request.url).pathname,
      request.headers.get('content-type'),
    ]),
  ).toEqual([
    ['POST', '/api/uploads', 'application/octet-stream'],
    ['PUT', '/api/videos/v%201', 'application/octet-stream'],
  ]);
});

test('over HTTP, the server answers from the first chunk while the client is still sending', async () => {
  await using handler = experimental_createOpenApiHandler({ router });
  const server = createServer();
  const scope = Scope.makeUnsafe();
  await Effect.runPromise(
    Layer.buildWithScope(
      serve(handler).pipe(
        Layer.provideMerge(
          NodeHttpServer.layer(() => server, { port: 0, host: '127.0.0.1' }),
        ),
      ),
      scope,
    ),
  );
  await using _server = {
    [Symbol.asyncDispose]: async () => {
      server.closeAllConnections();
      await Effect.runPromise(Scope.close(scope, Exit.void));
    },
  };
  const port = (server.address() as AddressInfo).port;
  const client = clientFor(`http://127.0.0.1:${port}`);

  // Never closed: the answer comes while the body is still being sent, and
  // the rest is drained rather than dropping the connection.
  const open = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('first chunk'));
    },
  });
  expect(await client.first.mutate(open)).toBe('first chunk');

  expect(await client.upload.mutate(streamOf('a', 'b', 'c'))).toBe('abc');
});
