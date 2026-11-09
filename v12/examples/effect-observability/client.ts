/**
 * The `web` service: three calls, each under a span of its own, with a
 * `web` SDK. `main(url)` resolves once that SDK has flushed, with its spans
 * and the trace id of each call.
 */
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import { httpLink, routerType } from '@trpc12/trpc/client';
import { createEffectClient } from '@trpc12/trpc/effect';
import type { AppRouter } from './server.ts';
import { findSpan, formatTrace, inMemoryTelemetry } from './telemetry.ts';

export const calls = ['signup.submit', 'profile', 'signup.retry'] as const;

const program = (url: string, email: string) =>
  Effect.gen(function* () {
    const client = createEffectClient({
      router: routerType<AppRouter>(),
      links: [httpLink({ url, headers: { authorization: 'u1' } })],
    });

    const user = yield* client.user.signup
      .mutate({ email })
      .pipe(Effect.withSpan('signup.submit'));
    yield* Effect.log('user.signup', user);
    assert.equal(user.email, email);

    const me = yield* client.user.me.query().pipe(Effect.withSpan('profile'));
    yield* Effect.log('user.me', me);
    assert.equal(me.id, 'u1');

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
    assert.equal(taken, 'ada@example.com is taken');
  });

export async function main(url: string, email = 'grace@example.com') {
  const web = inMemoryTelemetry('web');
  await Effect.runPromise(program(url, email).pipe(Effect.provide(web.layer)));
  const spans = web.spans();
  const traces = Object.fromEntries(
    calls.map((name) => [
      name,
      findSpan(spans, { name, service: 'web' }).spanContext().traceId,
    ]),
  ) as Record<(typeof calls)[number], string>;
  return { spans, traces };
}

if (import.meta.main) {
  const web = await main(
    process.argv[2] ?? 'http://localhost:3000/trpc',
    `grace+${Date.now()}@example.com`,
  );
  for (const traceId of Object.values(web.traces)) {
    console.log(`\n${formatTrace(traceId, web.spans)}`);
  }
}
