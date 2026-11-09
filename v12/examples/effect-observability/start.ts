/**
 * Runs `client.ts` against `server.ts`, then joins the two services' spans:
 * prints each call's trace and checks its shape.
 */
import { main } from './client.ts';
import { listen } from './server.ts';
import { findSpan, formatTrace, hrMs } from './telemetry.ts';

async function run() {
  await using server = await listen();
  const client = await main(server.url);
  // Signup answers before the welcome mail goes out; wait for it.
  console.log('mailer.welcome', await server.mailed());
  return { ...client, apiSpans: server.spans };
}

const { traces, ...ran } = await run();
// Both SDKs have flushed and shut down with their layers.
const spans = [...ran.spans, ...ran.apiSpans()];
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
