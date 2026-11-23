// @vitest-environment node
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { initTRPC } from '@trpc/server';

test('an SSE body that fails after its headers were sent reports its call and ends', async () => {
  const t = initTRPC.create({
    transformer: {
      serialize: () => {
        throw new Error('Cannot serialize');
      },
      deserialize: (value) => value,
    },
  });
  const router = t.router({
    onEvent: t.procedure.subscription(async function* () {
      yield 1;
    }),
  });
  await using ctx = testServerAndClientResource(router);

  const res = await fetch(`${ctx.httpUrl}/onEvent`, {
    headers: { accept: 'text/event-stream' },
  });
  expect(res.status).toBe(200);
  const body = await res.text();

  expect(body).toContain('event: connected');
  // the value fails to serialize, then so does the error event for it
  const reported = expect.objectContaining({
    path: 'onEvent',
    type: 'subscription',
    error: expect.objectContaining({ message: 'Cannot serialize' }),
  });
  expect(ctx.onErrorSpy.mock.calls.map(([opts]) => opts)).toEqual([
    reported,
    reported,
  ]);
});

test('an onError that throws for a failed SSE body is not reported again without its call', async () => {
  const t = initTRPC.create({
    transformer: {
      serialize: () => {
        throw new Error('Cannot serialize');
      },
      deserialize: (value) => value,
    },
  });
  const router = t.router({
    onEvent: t.procedure.subscription(async function* () {
      yield 1;
    }),
  });
  await using ctx = testServerAndClientResource(router, {
    server: {
      onError: () => {
        throw new Error('onError failed');
      },
    },
  });

  const res = await fetch(`${ctx.httpUrl}/onEvent`, {
    headers: { accept: 'text/event-stream' },
  });
  expect(res.status).toBe(200);
  const body = await res.text();

  expect(body).toContain('event: connected');
  // the value fails to serialize and `onError` throws, which fails the body;
  // the body reports that with its call and ends, so the adapter doesn't
  // report it again without one
  const reported = (message: string) =>
    expect.objectContaining({
      path: 'onEvent',
      type: 'subscription',
      error: expect.objectContaining({ message }),
    });
  expect(ctx.onErrorSpy.mock.calls.map(([opts]) => opts)).toEqual([
    reported('Cannot serialize'),
    reported('onError failed'),
  ]);
});
