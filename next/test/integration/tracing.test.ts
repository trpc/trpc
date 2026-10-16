import { Effect, Layer, Option, Tracer } from 'effect';
import {
  createTrpcClient,
  httpLink,
  wsLink,
  routerType,
} from '@trpc12/trpc/client';
import { createEffectClient } from '@trpc12/trpc/effect';
import { createFetchHandler, error, initTrpc } from '@trpc12/trpc/server';
import { expect, test } from 'vite-plus/test';
import { z } from 'zod';
import { createTestServer } from './fixtures/server.ts';

const t = initTrpc();
const router = {
  post: t.procedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) =>
      input.id === 'nope' ? error({ code: 'NOT_FOUND' }) : { id: input.id },
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
