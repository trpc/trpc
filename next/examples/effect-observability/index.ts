/**
 * Effect observability example: one trace from a client span through the
 * server's middleware and services to work that runs after the response.
 * Two OpenTelemetry SDKs, `web` and `api`, export into memory; the smoke
 * prints the trace and checks its shape. Run with `node index.ts`.
 */
import { createServer } from 'node:http';
import { NodeHttpServer } from '@effect/platform-node';
import { Effect, Layer, Queue } from 'effect';
import { HttpServer } from 'effect/http';
import { httpLink, routerType } from '@trpc12/trpc/client';
import { createEffectClient } from '@trpc12/trpc/effect';
import { serve } from '@trpc12/trpc/http';
import { type AppRouter, createApiHandler, Db, Mailer } from './server.ts';
import { findSpan, formatTrace, hrMs, inMemoryTelemetry } from './telemetry.ts';

const web = inMemoryTelemetry('web');
const api = inMemoryTelemetry('api');

const program = Effect.gen(function* () {
  const outbox = yield* Queue.unbounded<string>();
  const handler = yield* Effect.acquireRelease(
    Effect.sync(() =>
      createApiHandler(
        Layer.mergeAll(Db.memory, Mailer.memory(outbox), api.layer),
      ),
    ),
    (h) => Effect.promise(() => h.dispose()),
  );
  const server = yield* Layer.build(
    serve(handler).pipe(
      Layer.provideMerge(
        NodeHttpServer.layer(createServer, { port: 0, host: '127.0.0.1' }),
      ),
    ),
  );
  const url = yield* HttpServer.addressFormattedWith(Effect.succeed).pipe(
    Effect.provideContext(server),
  );
  const client = createEffectClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: `${url}/trpc`, headers: { authorization: 'u1' } })],
  });

  const user = yield* client.user.signup
    .mutate({ email: 'grace@example.com' })
    .pipe(Effect.withSpan('signup.submit'));
  yield* Effect.log('user.signup', user);
  if ((yield* Queue.size(outbox)) !== 0) {
    return yield* Effect.die('the mail should go out after the response');
  }
  const mailed = yield* Queue.take(outbox);
  yield* Effect.log('mailer.welcome', mailed);

  const me = yield* client.user.me.query().pipe(Effect.withSpan('profile'));
  yield* Effect.log('user.me', me);

  const taken = yield* client.user.signup
    .mutate({ email: 'ada@example.com' })
    .pipe(
      Effect.as('signed up'),
      Effect.catchTag('EMAIL_TAKEN', (err) =>
        Effect.succeed(`${err.data.email} is taken`),
      ),
      Effect.withSpan('signup.retry'),
    );
  yield* Effect.log('user.signup', taken);
});

await Effect.runPromise(program.pipe(Effect.scoped, Effect.provide(web.layer)));

// Both SDKs have flushed and shut down with their layers.
const spans = [...web.spans(), ...api.spans()];
const traces = Object.fromEntries(
  ['signup.submit', 'profile', 'signup.retry'].map((name) => [
    name,
    findSpan(spans, { name, service: 'web' }).spanContext().traceId,
  ]),
);
for (const traceId of Object.values(traces)) {
  console.log(`\n${formatTrace(traceId, spans)}`);
}

const inSignup = (name: string) =>
  findSpan(spans, { traceId: traces['signup.submit'], name, service: 'api' });
const handled = inSignup('trpc.user.signup');
for (const span of [inSignup('db.users.insert'), inSignup('mailer.welcome')]) {
  if (span.parentSpanContext?.spanId !== handled.spanContext().spanId) {
    throw new Error(`${span.name} should nest under the server span`);
  }
}
if (hrMs(inSignup('mailer.welcome').endTime) <= hrMs(handled.endTime)) {
  throw new Error('the mail should go out after the call ends');
}
const me = findSpan(spans, {
  traceId: traces['profile'],
  name: 'trpc.user.me',
  service: 'api',
});
if (me.attributes['enduser.id'] !== 'u1') {
  throw new Error('the middleware should tag the server span with the user');
}
const retried = findSpan(spans, {
  traceId: traces['signup.retry'],
  name: 'trpc.user.signup',
  service: 'api',
});
if (retried.attributes['trpc.error.code'] !== 'EMAIL_TAKEN') {
  throw new Error('the failed call should record its error code');
}
