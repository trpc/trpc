import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { NodeHttpServer } from '@effect/platform-node';
import { Effect, Exit, Option, Schema, Scope, Stream } from 'effect';
import { toLambdaHandler, type LambdaV2Result } from '@trpc12/trpc/aws-lambda';
import {
  createTrpcClient,
  httpLink,
  localLink,
  retryLink,
  routerType,
  safe,
  TrpcError,
  wsLink,
} from '@trpc12/trpc/client';
import { toHttpEffect } from '@trpc12/trpc/http';
import { experimental_createProgressiveJson } from '@trpc12/trpc/transformer';
import {
  createFetchHandler,
  createRouterClient,
  experimental_byteStream,
  initTrpc,
  stream,
  type experimental_ByteStream,
} from '@trpc12/trpc/server';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';
import { createTestServer } from '../../fixtures/server.ts';
import { HEADER, PROTOCOL_VERSION } from '../../internal/protocol.ts';

const t = initTrpc();

const text = (bytes: experimental_ByteStream) =>
  bytes.pipe(
    Stream.decodeText(),
    Stream.runFold(
      () => '',
      (all, part) => all + part,
    ),
  );

let attempts = 0;
/** Told how the next `watched` call's read ended. */
const watchers: Array<(outcome: string) => void> = [];

const router = t.router({
  echo: t.procedure.input(experimental_byteStream()).mutation((opts) => {
    expectTypeOf(opts.input).toEqualTypeOf<experimental_ByteStream>();
    return text(opts.input);
  }),
  size: t.procedure.input(experimental_byteStream()).query((opts) =>
    Stream.runFold(
      opts.input,
      () => 0,
      (n, chunk) => n + chunk.byteLength,
    ),
  ),
  limited: t.procedure
    .input(experimental_byteStream({ maxBytes: 8 }))
    .mutation((opts) => text(opts.input)),
  twice: t.procedure
    .input(experimental_byteStream())
    .mutation((opts) =>
      Effect.andThen(Stream.runDrain(opts.input), Stream.runDrain(opts.input)),
    ),
  progress: t.procedure
    .input(experimental_byteStream())
    .output(stream(Schema.Number))
    .mutation((opts) =>
      opts.input.pipe(
        Stream.mapAccum(
          () => 0,
          (n, chunk) => [n + chunk.byteLength, [n + chunk.byteLength]] as const,
        ),
      ),
    ),
  unread: t.procedure.input(experimental_byteStream()).mutation(() => {
    throw new TrpcError.Unauthorized({ message: 'Sign in first' });
  }),
  watched: t.procedure.input(experimental_byteStream()).mutation((opts) =>
    Stream.runDrain(opts.input).pipe(
      Effect.onExit((exit) =>
        Effect.sync(() =>
          watchers.shift()?.(
            Exit.isSuccess(exit)
              ? 'done'
              : (Exit.findErrorOption(exit).pipe(
                  Option.map((err) => err.code),
                  Option.getOrElse(() => 'interrupted'),
                ) as string),
          ),
        ),
      ),
    ),
  ),
  flaky: t.procedure.input(experimental_byteStream()).query(() => {
    attempts++;
    throw new Error('boom');
  }),
  hello: t.procedure
    .input(z.object({ name: z.string() }))
    .query((opts) => `hello ${opts.input.name}`),
});
type AppRouter = typeof router;

const encoder = new TextEncoder();
const bytes = (...chunks: string[]): ReadableStream<Uint8Array> =>
  Stream.toReadableStream(
    Stream.fromIterable(chunks.map((chunk) => encoder.encode(chunk))),
  );

test('a byte stream input is the request body, which the resolver reads as an Effect Stream', async () => {
  await using server = await createTestServer({ router });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: server.url })],
  });
  expect(await client.echo.mutate(bytes('hello ', 'world'))).toBe(
    'hello world',
  );
  expect(server.requests.map((r) => r.method)).toEqual(['POST']);
  expect(server.requests[0]!.headers.get('content-type')).toBe(
    'application/octet-stream',
  );
  expectTypeOf<Parameters<typeof client.echo.mutate>[0]>().toEqualTypeOf<
    ReadableStream<Uint8Array>
  >();
  expectTypeOf<
    Awaited<ReturnType<typeof client.echo.mutate>>
  >().toEqualTypeOf<string>();
});

test('a File or Blob goes up as a byte stream with .stream()', async () => {
  await using server = await createTestServer({ router });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: server.url })],
  });
  const file = new File([new Uint8Array(300_000).fill(1)], 'big.bin');
  expect(await client.size.query(file.stream())).toBe(300_000);
  expect(server.requests.map((r) => r.method)).toEqual(['POST']);
});

test('the resolver reads the body while it arrives, and can stream its output back', async () => {
  await using server = await createTestServer({ router });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: server.url })],
  });
  let resolve!: () => void;
  const firstSeen = new Promise<void>((r) => (resolve = r));
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode('abc'));
      // The second chunk waits until the client has seen the first count.
      await firstSeen;
      controller.enqueue(encoder.encode('de'));
      controller.close();
    },
  });
  const counts: number[] = [];
  for await (const n of await client.progress.mutate(body)) {
    counts.push(n);
    if (n === 3) resolve();
  }
  expect(counts).toEqual([3, 5]);
});

test('maxBytes fails the stream with PAYLOAD_TOO_LARGE', async () => {
  await using server = await createTestServer({ router });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: server.url })],
  });
  expect(await client.limited.mutate(bytes('12345678'))).toBe('12345678');
  const [, err] = await safe(client.limited.mutate(bytes('12345', '6789')));
  expect(err).toMatchObject({
    code: 'PAYLOAD_TOO_LARGE',
    message: 'The byte stream is over 8 bytes',
  });
});

/** `count` chunks of 64 KiB. */
const large = (count: number): ReadableStream<Uint8Array> =>
  Stream.toReadableStream(
    Stream.range(1, count).pipe(
      Stream.map(() => new Uint8Array(65_536).fill(7)),
    ),
  );

test('a resolver that stops reading, or never reads, still answers, and the server keeps serving', async () => {
  await using server = await createTestServer({ router });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: server.url })],
  });
  const [, tooLarge] = await safe(client.limited.mutate(large(64)));
  expect(tooLarge).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  const [, unauthorized] = await safe(client.unread.mutate(large(64)));
  expect(unauthorized).toMatchObject({
    code: 'UNAUTHORIZED',
    message: 'Sign in first',
  });
  expect(await client.size.query(large(4))).toBe(4 * 65_536);
});

test('a client that goes away mid-upload interrupts the resolver', async () => {
  await using server = await createTestServer({ router });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: server.url })],
  });
  const outcome = new Promise<string>((resolve) => watchers.push(resolve));
  const controller = new AbortController();
  const body = new ReadableStream<Uint8Array>({
    start(stream) {
      stream.enqueue(encoder.encode('partial'));
    },
  });
  const call = safe(client.watched.mutate(body, { signal: controller.signal }));
  await new Promise((resolve) => setTimeout(resolve, 50));
  controller.abort();
  expect((await call)[1]).toMatchObject({ code: 'CLIENT_CLOSED_REQUEST' });
  expect(await outcome).toBe('interrupted');
});

test('the body is read once; reading it again fails with BAD_REQUEST', async () => {
  await using server = await createTestServer({ router });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: server.url })],
  });
  const [, err] = await safe(client.twice.mutate(bytes('x')));
  expect(err).toMatchObject({
    code: 'BAD_REQUEST',
    message: 'The byte stream can only be read once',
  });
});

test('a byte stream call leaves the batch and goes alone', async () => {
  await using server = await createTestServer({ router, batch: true });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: server.url, batch: true })],
  });
  const results = await Promise.all([
    client.size.query(bytes('four')),
    client.hello.query({ name: 'a' }),
    client.hello.query({ name: 'b' }),
  ]);
  expect(results).toEqual([4, 'hello a', 'hello b']);
  expect(server.requests).toHaveLength(2);
});

test('progressive JSON and other transformers leave the body as it is', async () => {
  const transformer = experimental_createProgressiveJson();
  await using server = await createTestServer({ router, transformer });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: server.url, transformer, binary: true })],
  });
  expect(await client.echo.mutate(bytes('progressive JSON'))).toBe(
    'progressive JSON',
  );
});

test('retryLink never retries a byte stream call, as its body is read once', async () => {
  await using server = await createTestServer({ router });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      retryLink({ retries: 2, delay: () => 0 }),
      httpLink({ url: server.url }),
    ],
  });
  attempts = 0;
  const [, err] = await safe(client.flaky.query(bytes('x')));
  expect(err).toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  expect(attempts).toBe(1);
});

test("handler.fetch takes a byte stream, for fetch runtimes (Workers, Deno, Bun, Next's route handlers)", async () => {
  const handler = createFetchHandler({ router });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      httpLink({
        url: 'http://localhost/trpc',
        fetch: (input, init) =>
          handler.fetch(new Request(input as string, init)),
      }),
    ],
  });
  expect(await client.echo.mutate(bytes('on ', 'fetch'))).toBe('on fetch');
  const empty = await handler.fetch(
    new Request('http://localhost/trpc/echo', {
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream',
        [HEADER.version]: PROTOCOL_VERSION,
      },
    }),
  );
  expect(await empty.json()).toEqual({ json: '' });
  await handler.dispose();
});

/** A Node `(req, res)` handler, as Express, Fastify and node:http mount it, whose requests `before` sees first. */
async function listenNode(before?: (req: IncomingMessage) => Promise<void>) {
  const scope = Scope.makeUnsafe();
  const nodeHandler = await Effect.runPromise(
    NodeHttpServer.makeHandler(toHttpEffect(createFetchHandler({ router })), {
      scope,
    }),
  );
  const server = createServer(async (req, res) => {
    await before?.(req);
    nodeHandler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}/trpc`,
    [Symbol.asyncDispose]: async () => {
      server.closeAllConnections();
      server.close();
      await Effect.runPromise(Scope.close(scope, Exit.void));
    },
  };
}

/** Reads the body first, as `express.raw()` does when `raw` is set, or a parser that drops it otherwise. */
const readFirst =
  (raw: boolean) => async (req: IncomingMessage & { body?: unknown }) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    await once(req, 'end');
    if (raw) req.body = new Uint8Array(Buffer.concat(chunks));
  };

test('a Node (req, res) handler streams the body, or replays one express.raw() read', async () => {
  for (const before of [undefined, readFirst(true)]) {
    await using server = await listenNode(before);
    const client = createTrpcClient({
      router: routerType<AppRouter>(),
      links: [httpLink({ url: server.url })],
    });
    expect(await client.echo.mutate(bytes('on ', 'node'))).toBe('on node');
  }
});

test('a body another middleware read and dropped is an INTERNAL_SERVER_ERROR', async () => {
  await using server = await listenNode(readFirst(false));
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: server.url })],
  });
  const [, err] = await safe(client.echo.mutate(bytes('gone')));
  expect(err).toMatchObject({
    code: 'INTERNAL_SERVER_ERROR',
    message: expect.stringMatching(/already read by another middleware/),
  });
});

test('AWS Lambda takes a byte stream from the (buffered) event body', async () => {
  const lambda = toLambdaHandler(createFetchHandler({ router }));
  const result = (await lambda(
    {
      version: '2.0',
      rawPath: '/trpc/echo',
      rawQueryString: '',
      headers: {
        'content-type': 'application/octet-stream',
        [HEADER.version]: PROTOCOL_VERSION,
      },
      body: Buffer.from('on lambda').toString('base64'),
      isBase64Encoded: true,
      requestContext: { http: { method: 'POST' }, domainName: 'x.aws' },
    },
    { awsRequestId: 'req-1', getRemainingTimeInMillis: () => 30_000 },
  )) as LambdaV2Result;
  expect(JSON.parse(result.body)).toEqual({ json: 'on lambda' });
});

test('octet-stream bodies need a byte stream procedure and the version header', async () => {
  await using server = await createTestServer({ router });
  const post = (path: string, headers: Record<string, string>) =>
    fetch(`${server.url}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream', ...headers },
      body: 'bytes',
    });
  const versioned: Record<string, string> = {
    [HEADER.version]: PROTOCOL_VERSION,
  };

  const notStream = await post('hello', versioned);
  expect(notStream.status).toBe(415);
  expect(await notStream.json()).toMatchObject({
    json: {
      error: {
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message:
          'application/octet-stream bodies are for procedures whose input is experimental_byteStream()',
      },
    },
  });

  // A cross-site page can't add the header without a preflight.
  const unversioned = await post('echo', {});
  expect(unversioned.status).toBe(415);

  expect(await (await post('echo', versioned)).json()).toEqual({
    json: 'bytes',
  });
});

test('a JSON input to a byte stream procedure fails validation', async () => {
  await using server = await createTestServer({ router });
  const res = await fetch(`${server.url}/echo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"json":"not a stream"}',
  });
  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({
    json: {
      error: {
        code: 'BAD_REQUEST',
        data: {
          issues: [
            { path: [], message: 'Expected ReadableStream<Uint8Array>' },
          ],
        },
      },
    },
  });
});

test('in-process callers pass the stream through', async () => {
  const caller = createRouterClient(router, { ctx: {} });
  expect(await caller.echo.mutate(bytes('in ', 'process'))).toBe('in process');

  for (const link of [
    localLink({ router }),
    localLink({ router, transformer: false }),
  ]) {
    const client = createTrpcClient({
      router: routerType<AppRouter>(),
      links: [link],
    });
    expect(await client.echo.mutate(bytes('local'))).toBe('local');
  }
});

test('wsLink rejects a byte stream input with a clear error', async () => {
  await using server = await createTestServer({ router });
  await using ws = wsLink({ url: server.wsUrl });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [ws],
  });
  const [, err] = await safe(client.echo.mutate(bytes('x')));
  expect(err).toMatchObject({
    code: 'BAD_REQUEST',
    message: 'Byte stream inputs need httpLink',
  });
});

test('the schema encodes a Stream back to a ReadableStream', async () => {
  const encoded = await Effect.runPromise(
    Schema.encodeEffect(experimental_byteStream())(
      Stream.make(encoder.encode('round '), encoder.encode('trip')),
    ),
  );
  expect(encoded).toBeInstanceOf(ReadableStream);
  expect(await new Response(encoded).text()).toBe('round trip');
});
