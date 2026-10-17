import { Effect, Layer, Option, References, Stream, Tracer } from 'effect';
import {
  createTrpcClient,
  httpLink,
  link,
  localLink,
  wsLink,
  routerType,
} from '@trpc12/trpc/client';
import { createEffectClient } from '@trpc12/trpc/effect';
import {
  type AnyRouter,
  createFetchHandler,
  error,
  initTrpc,
} from '@trpc12/trpc/server';
import { expect, test } from 'vite-plus/test';
import { z } from 'zod';
import { createTestServer } from '../fixtures/server.ts';

const t = initTrpc();
const router = {
  post: t.procedure
    .input(z.object({ id: z.string() }))
    .query((opts) =>
      opts.input.id === 'nope'
        ? error({ code: 'NOT_FOUND' })
        : { id: opts.input.id },
    ),
};

function recorder() {
  const spans: Tracer.Span[] = [];
  const tracer = Tracer.make({
    span(options) {
      const span = Tracer.nativeTracer.span(options);
      spans.push(span);
      return span;
    },
  });
  const named = (name: string, kind: Tracer.SpanKind) =>
    spans.find((s) => s.name === name && s.kind === kind);
  return { spans, tracer, named };
}

test('client and server spans share a trace through traceparent', async () => {
  const server = recorder();
  await using http = await createTestServer({
    router,
    layer: Layer.succeed(Tracer.Tracer, server.tracer),
  });
  const client = recorder();
  const trpc = createEffectClient({
    router,
    links: [httpLink({ url: http.url })],
  });

  await Effect.runPromise(
    trpc.post
      .query({ id: '1' })
      .pipe(Effect.withSpan('page'), Effect.withTracer(client.tracer)),
  );

  const page = client.named('page', 'internal')!;
  const call = client.named('trpc.post', 'client')!;
  expect(Option.getOrUndefined(call.parent)?.spanId).toBe(page.spanId);
  expect(Object.fromEntries(call.attributes)).toMatchObject({
    'rpc.system': 'trpc',
    'rpc.method': 'post',
    'trpc.type': 'query',
  });
  const traceparent = http.requests[0]!.headers.get('traceparent');
  expect(traceparent).toBe(`00-${call.traceId}-${call.spanId}-01`);
  expect(http.requests[0]!.headers.get('b3')).toBe(
    `${call.traceId}-${call.spanId}-1-${page.spanId}`,
  );

  const handled = server.named('trpc.post', 'server')!;
  expect(handled.traceId).toBe(call.traceId);
});

test('a WebSocket call carries its trace context, so the server span joins the trace', async () => {
  const server = recorder();
  await using http = await createTestServer({
    router,
    layer: Layer.succeed(Tracer.Tracer, server.tracer),
  });
  await using ws = wsLink({ url: http.wsUrl });
  const client = recorder();
  const trpc = createEffectClient({ router, links: [ws] });

  await Effect.runPromise(
    Effect.gen(function* () {
      yield* trpc.post.query({ id: '1' });
      yield* trpc.post.query({ id: '2' });
    }).pipe(Effect.withTracer(client.tracer)),
  );

  const calls = client.spans.filter((s) => s.name === 'trpc.post');
  const handled = server.spans.filter((s) => s.name === 'trpc.post');
  expect(handled).toHaveLength(2);
  for (const [i, span] of handled.entries()) {
    expect(span.traceId).toBe(calls[i]!.traceId);
    expect(Option.getOrUndefined(span.parent)?.spanId).toBe(calls[i]!.spanId);
  }
  expect(calls[0]!.traceId).not.toBe(calls[1]!.traceId);
});

test('a failed call records the error code on the client span', async () => {
  await using http = await createTestServer({ router });
  const client = recorder();
  const trpc = createEffectClient({
    router,
    links: [httpLink({ url: http.url })],
  });
  await Effect.runPromise(
    trpc.post
      .query({ id: 'nope' })
      .pipe(Effect.ignore, Effect.withTracer(client.tracer)),
  );
  const call = client.named('trpc.post', 'client')!;
  expect(call.attributes.get('trpc.error.code')).toBe('NOT_FOUND');
  expect(call.status._tag).toBe('Ended');
});

test('without a tracer, or with propagation disabled, requests carry no trace headers', async () => {
  await using http = await createTestServer({ router });
  const plain = createTrpcClient({
    router: routerType<typeof router>(),
    links: [httpLink({ url: http.url })],
  });
  await plain.post.query({ id: '1' });

  const client = recorder();
  const trpc = createEffectClient({
    router,
    links: [httpLink({ url: http.url })],
  });
  await Effect.runPromise(
    trpc.post
      .query({ id: '2' })
      .pipe(
        Effect.provideService(Tracer.DisablePropagation, true),
        Effect.withTracer(client.tracer),
      ),
  );
  expect(http.requests.map((r) => r.headers.get('traceparent'))).toEqual([
    null,
    null,
  ]);
  expect(client.named('trpc.post', 'client')).toBeDefined();
});

test('the server span is the current span, the stack frame and the parent of spans in the call', async () => {
  const server = recorder();
  const seen: { span?: string; frame?: string | undefined } = {};
  const handler = createFetchHandler({
    router: {
      inner: t.procedure.query(() =>
        Effect.gen(function* () {
          seen.span = (yield* Effect.orDie(Effect.currentSpan)).name;
          seen.frame = (yield* References.CurrentStackFrame)?.name;
          return yield* Effect.succeed('ok').pipe(Effect.withSpan('work'));
        }),
      ),
      fails: t.procedure.query(() => error({ code: 'NOT_FOUND' })),
    },
    layer: Layer.succeed(Tracer.Tracer, server.tracer),
  });
  await handler.fetch(new Request('http://localhost/trpc/inner'));
  await handler.fetch(new Request('http://localhost/trpc/fails'));
  await handler.dispose();

  expect(seen).toEqual({ span: 'trpc.inner', frame: 'trpc.inner' });
  const inner = server.named('trpc.inner', 'server')!;
  expect(Object.fromEntries(inner.attributes)).toEqual({
    'rpc.system': 'trpc',
    'rpc.method': 'inner',
    'trpc.type': 'query',
  });
  expect(inner.status._tag).toBe('Ended');
  const work = server.named('work', 'internal')!;
  expect(Option.getOrUndefined(work.parent)?.spanId).toBe(inner.spanId);
  const fails = server.named('trpc.fails', 'server')!;
  expect(fails.attributes.get('trpc.error.code')).toBe('NOT_FOUND');
  expect(fails.status._tag).toBe('Ended');
});

test('without a tracer, calls open no spans: tracing is opt-in', async () => {
  const seen: string[] = [];
  const spanName = Effect.map(
    Effect.option(Effect.currentSpan),
    (span) => Option.getOrUndefined(span)?.name ?? 'none',
  );
  const traced = {
    inner: t.procedure.query(() =>
      Effect.map(spanName, (name) => {
        seen.push(`resolver: ${name}`);
        return 'ok';
      }),
    ),
  } satisfies AnyRouter;
  const handler = createFetchHandler({ router: traced });
  await handler.fetch(new Request('http://localhost/trpc/inner'));
  await handler.dispose();

  const spy = link((opts) =>
    Stream.unwrap(
      Effect.map(spanName, (name) => {
        seen.push(`link: ${name}`);
        return opts.next(opts.op);
      }),
    ),
  );
  const trpc = createEffectClient({
    router: traced,
    links: [spy, localLink({ router: traced })],
  });
  await Effect.runPromise(trpc.inner.query().pipe(Effect.withSpan('page')));

  // Locally, the resolver runs in the caller's span.
  expect(seen).toEqual(['resolver: none', 'link: page', 'resolver: page']);
});

test('handler.fetch continues the trace in an incoming traceparent', async () => {
  const server = recorder();
  const handler = createFetchHandler({
    router,
    layer: Layer.succeed(Tracer.Tracer, server.tracer),
  });
  const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
  const res = await handler.fetch(
    new Request(
      `http://localhost/trpc/post?input=${encodeURIComponent('{"id":"abc"}')}`,
      {
        headers: { traceparent: `00-${traceId}-00f067aa0ba902b7-01` },
      },
    ),
  );
  expect(res.status).toBe(200);
  expect(server.named('trpc.post', 'server')?.traceId).toBe(traceId);
  await handler.dispose();
});
