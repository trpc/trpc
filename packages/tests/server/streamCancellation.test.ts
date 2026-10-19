import type { ServerResponse } from 'node:http';
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { httpBatchStreamLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

/**
 * A procedure streaming into a response that waits on its signal, as one
 * reading `on(emitter, …, { signal })` does, ends when the client leaves.
 */
const t = initTRPC.context<{ res?: ServerResponse }>().create();
const state = {
  waiting: 0,
  cleanups: 0,
  res: undefined as ServerResponse | undefined,
};
const untilAborted = (signal: AbortSignal) =>
  new Promise((resolve) =>
    signal.addEventListener('abort', resolve, { once: true }),
  );
// Bigger than the socket's buffers, so the server is left waiting to write it.
const big = 'x'.repeat(16 * 1024 * 1024);

const router = t.router({
  rows: t.procedure.query(async function* (opts) {
    state.res = opts.ctx.res;
    try {
      yield big;
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

/** A `fetch` whose body stops being read once `stall()` is called. */
function stallableFetch() {
  let stalled = false;
  const fetchImpl: typeof fetch = async (input, init) => {
    const res = await fetch(input, init);
    const reader = res.body!.getReader();
    const body = new ReadableStream<Uint8Array>(
      {
        async pull(controller) {
          if (stalled)
            return new Promise<void>(() => {
              // never resolves: the client stops reading
            });
          const chunk = await reader.read();
          if (chunk.done) controller.close();
          else controller.enqueue(chunk.value);
        },
        cancel: (reason) => reader.cancel(reason),
      },
      { highWaterMark: 0 },
    );
    return new Response(body, { headers: res.headers, status: res.status });
  };
  return {
    fetch: fetchImpl,
    stall: () => {
      stalled = true;
    },
  };
}

/** Reads the body until it ends or is cancelled. */
function drain(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const done = (async () => {
    while (!(await reader.read()).done);
  })();
  return { reader, done };
}

test('httpBatchStreamLink: a client that leaves mid-write ends a query waiting on its signal', async () => {
  const stallable = stallableFetch();
  await using ctx = testServerAndClientResource(router, {
    server: { createContext: (opts) => ({ res: opts.res }) },
    client: (opts) => ({
      links: [
        httpBatchStreamLink({ url: opts.httpUrl, fetch: stallable.fetch }),
      ],
    }),
  });
  const before = { ...state };
  const ac = new AbortController();
  await ctx.client.rows.query(undefined, { signal: ac.signal });
  stallable.stall();
  await vi.waitFor(() => expect(state.waiting).toBe(before.waiting + 1));
  await vi.waitFor(() => expect(state.res?.writableNeedDrain).toBe(true));

  ac.abort();
  await vi.waitFor(() => expect(state.cleanups).toBe(before.cleanups + 1));
});

test('fetch adapter: cancelling a JSON Lines body without aborting the request ends a query waiting on its signal', async () => {
  const before = { ...state };
  const res = await fetchRequestHandler({
    router,
    endpoint: '/trpc',
    createContext: () => ({}),
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
    createContext: () => ({}),
    req: new Request('http://localhost/trpc/events'),
  });
  const body = drain(res.body!);
  await vi.waitFor(() => expect(state.waiting).toBe(before.waiting + 1));

  await body.reader.cancel();
  await body.done;
  await vi.waitFor(() => expect(state.cleanups).toBe(before.cleanups + 1));
});
