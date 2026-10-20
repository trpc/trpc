import { Effect, Option, Schema, Stream } from 'effect';
import { experimental_toContract } from '@trpc12/trpc/contract';
import {
  experimental_createOpenApiHandler,
  experimental_openapi,
} from '@trpc12/trpc/openapi';
import {
  type AnyRouter,
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

const router = {
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
} satisfies AnyRouter;

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

test('a handler built from a contract streams the body too', async () => {
  await using handler = experimental_createOpenApiHandler({
    router,
    contract: experimental_toContract(router),
  });
  const res = await send(handler, 'POST', '/uploads', streamOf('contract'));
  expect(await res.json()).toBe('contract');
});
