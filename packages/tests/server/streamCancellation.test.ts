import { initTRPC } from '@trpc/server';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

/**
 * A procedure streaming into a response that waits on its signal, as one
 * reading `on(emitter, …, { signal })` does, ends when the client cancels
 * the body, even if the request's signal never aborts.
 */
const t = initTRPC.create();
const state = { waiting: 0, cleanups: 0 };
const untilAborted = (signal: AbortSignal) =>
  new Promise((resolve) =>
    signal.addEventListener('abort', resolve, { once: true }),
  );

const router = t.router({
  rows: t.procedure.query(async function* (opts) {
    try {
      yield 'row';
      state.waiting++;
      await untilAborted(opts.signal!);
      yield 'aborted';
    } finally {
      state.cleanups++;
    }
  }),
  events: t.procedure.subscription(async function* (opts) {
    try {
      yield 1;
      state.waiting++;
      await untilAborted(opts.signal!);
    } finally {
      state.cleanups++;
    }
  }),
});

/** Reads the body until it ends or is cancelled. */
function drain(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const done = (async () => {
    while (!(await reader.read()).done);
  })();
  return { reader, done };
}

test('fetch adapter: cancelling a JSON Lines body without aborting the request ends a query waiting on its signal', async () => {
  const before = { ...state };
  const res = await fetchRequestHandler({
    router,
    endpoint: '/trpc',
    req: new Request('http://localhost/trpc/rows?batch=1&input={}', {
      headers: { 'trpc-accept': 'application/jsonl' },
    }),
  });
  const body = drain(res.body!);
  await vi.waitFor(() => expect(state.waiting).toBe(before.waiting + 1));

  await body.reader.cancel();
  await body.done;
  await vi.waitFor(() => expect(state.cleanups).toBe(before.cleanups + 1));
});

test('fetch adapter: cancelling an SSE body without aborting the request ends a subscription waiting on its signal', async () => {
  const before = { ...state };
  const res = await fetchRequestHandler({
    router,
    endpoint: '/trpc',
    req: new Request('http://localhost/trpc/events'),
  });
  const body = drain(res.body!);
  await vi.waitFor(() => expect(state.waiting).toBe(before.waiting + 1));

  await body.reader.cancel();
  await body.done;
  await vi.waitFor(() => expect(state.cleanups).toBe(before.cleanups + 1));
});
