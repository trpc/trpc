import { createServer } from 'node:http';
import { NodeHttpServer } from '@effect/platform-node';
import { expect, it } from '@effect/vitest';
import { Context, Effect, Layer, Queue } from 'effect';
import { httpStreamLink, routerType } from '@trpc12/trpc/client';
import { createEffectClient } from '@trpc12/trpc/effect';
import { TestServer } from '@trpc12/trpc/internal/testing';
import { type AppRouter, apiOptions, Db, Mailer } from './server.ts';
import { findSpan, hrMs, inMemoryTelemetry } from './telemetry.ts';

const web = inMemoryTelemetry('web');
const api = inMemoryTelemetry('api');

class Outbox extends Context.Service<Outbox, Queue.Queue<string>>()('Outbox') {}

const server = Layer.unwrap(
  Effect.gen(function* () {
    const outbox = yield* Outbox;
    return TestServer.layer(
      apiOptions(Layer.mergeAll(Db.memory, Mailer.memory(outbox), api.layer)),
    );
  }),
).pipe(
  Layer.provide(
    NodeHttpServer.layer(createServer, { port: 0, host: '127.0.0.1' }),
  ),
  Layer.provideMerge(Layer.effect(Outbox, Queue.unbounded<string>())),
);

const client = (userId?: string) =>
  Effect.gen(function* () {
    const testServer = yield* TestServer;
    return createEffectClient({
      router: routerType<AppRouter>(),
      links: [
        httpStreamLink({
          url: testServer.url,
          headers: userId ? { authorization: userId } : {},
        }),
      ],
    });
  });

/** The spans both services ended in the trace of `web`'s `name` span. */
const traceOf = (name: string) => {
  const spans = [...web.spans(), ...api.spans()];
  const traceId = findSpan(spans, { name, service: 'web' }).spanContext()
    .traceId;
  return (name: string, service: 'web' | 'api') =>
    findSpan(spans, { traceId, name, service });
};

it.layer(server)('effect-observability', (it) => {
  it.effect(
    'one trace runs from the client span to the mail sent after the response',
    () =>
      Effect.gen(function* () {
        const trpc = yield* client();
        const outbox = yield* Outbox;
        const testServer = yield* TestServer;
        const before = testServer.requests.length;

        const user = yield* trpc.user.signup
          .mutate({ email: 'grace@example.com' })
          .pipe(Effect.withSpan('signup.submit'), Effect.provide(web.layer));
        expect(user.email).toBe('grace@example.com');
        expect(yield* Queue.size(outbox)).toBe(0);
        expect(yield* Queue.take(outbox)).toBe('grace@example.com');

        const span = traceOf('signup.submit');
        const page = span('signup.submit', 'web');
        const call = span('trpc.user.signup', 'web');
        const handled = span('trpc.user.signup', 'api');
        const insert = span('db.users.insert', 'api');
        const mail = span('mailer.welcome', 'api');

        expect(call.parentSpanContext?.spanId).toBe(page.spanContext().spanId);
        const traceparent =
          testServer.requests[before]!.headers.get('traceparent');
        expect(traceparent).toContain(page.spanContext().traceId);
        expect(handled.attributes).toMatchObject({
          'rpc.system': 'trpc',
          'rpc.method': 'user.signup',
          'trpc.type': 'mutation',
        });
        expect(insert.parentSpanContext?.spanId).toBe(
          handled.spanContext().spanId,
        );
        expect(insert.attributes['db.operation.name']).toBe('insert');
        expect(mail.parentSpanContext?.spanId).toBe(
          handled.spanContext().spanId,
        );
        expect(hrMs(mail.endTime)).toBeGreaterThan(hrMs(handled.endTime));
      }),
  );

  it.effect('the Effect middleware provides the user and tags the call', () =>
    Effect.gen(function* () {
      const trpc = yield* client('u1');
      const me = yield* trpc.user.me
        .query()
        .pipe(Effect.withSpan('profile'), Effect.provide(web.layer));
      expect(me).toEqual({ id: 'u1', email: 'ada@example.com' });

      const span = traceOf('profile');
      const handled = span('trpc.user.me', 'api');
      expect(handled.attributes['enduser.id']).toBe('u1');
      expect(span('db.users.find', 'api').parentSpanContext?.spanId).toBe(
        handled.spanContext().spanId,
      );
    }),
  );

  it.effect('a failed call records its error code on both sides', () =>
    Effect.gen(function* () {
      const trpc = yield* client();
      const failed = yield* trpc.user.signup
        .mutate({ email: 'ada@example.com' })
        .pipe(
          Effect.flip,
          Effect.withSpan('signup.retry'),
          Effect.provide(web.layer),
        );
      expect(failed.code).toBe('EMAIL_TAKEN');

      const span = traceOf('signup.retry');
      for (const service of ['web', 'api'] as const) {
        expect(
          span('trpc.user.signup', service).attributes['trpc.error.code'],
        ).toBe('EMAIL_TAKEN');
      }
      const unauthorized = yield* trpc.user.me.query().pipe(Effect.flip);
      expect(unauthorized.code).toBe('UNAUTHORIZED');
    }),
  );
});
