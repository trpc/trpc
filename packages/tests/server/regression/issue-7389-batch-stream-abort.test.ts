/**
 * Regression test for https://github.com/trpc/trpc/issues/7389
 *
 * `httpBatchStreamLink` created an `AbortController` and passed it to
 * `jsonlStreamConsumer` to cancel the response body stream, but the
 * observable teardown was a noop — so unsubscribing before the response
 * arrived left the stream consumer reading indefinitely.
 *
 * The fix aborts that `AbortController` when the batch's combined abort signal
 * fires. The combined signal can already be aborted by the time the batch is
 * dispatched (every subscriber unsubscribed first), in which case
 * `addEventListener('abort', ...)` never fires — so the abort is now also
 * forwarded eagerly, carrying the abort reason through to the stream consumer.
 */
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { httpBatchStreamLink } from '@trpc/client';
import type { TRPCClientRuntime } from '@trpc/client';
import { createChain } from '@trpc/client/links/internals/createChain';
import { initTRPC } from '@trpc/server';
import { createDeferred } from '@trpc/server/unstable-core-do-not-import';

const mockRuntime: TRPCClientRuntime = {};

test('unsubscribing before response arrives aborts the JSONL stream consumer', async () => {
  // Gate that keeps the server procedure pending until we release it
  const responseDeferred = createDeferred<void>();

  const t = initTRPC.create();
  const router = t.router({
    slow: t.procedure.query(async () => {
      await responseDeferred.promise;
      return 'done';
    }),
  });

  await using ctx = testServerAndClientResource(router, {
    server: {},
    clientLink: 'httpBatchStreamLink',
  });

  // Spy on AbortController.prototype.abort so we can detect when any instance
  // is aborted (the per-observable abort propagates to the JSONL stream).
  const abortSpy = vi.spyOn(AbortController.prototype, 'abort');

  const links = [
    httpBatchStreamLink({
      url: ctx.httpUrl,
    })(mockRuntime),
  ];

  const chain = createChain({
    links,
    op: {
      id: 1,
      type: 'query',
      path: 'slow',
      input: undefined,
      context: {},
      signal: null,
    },
  });

  // Subscribe and immediately unsubscribe — the response has not arrived yet
  // because responseDeferred is not resolved.
  const subscription = chain.subscribe({
    error() {
      // ignore any abort errors from unsubscribing
    },
  });

  // Give the dataLoader a tick to dispatch the batch request
  await new Promise((resolve) => setTimeout(resolve, 10));

  // Unsubscribe before the server responds
  subscription.unsubscribe();

  // The per-observable AbortController's abort() should have been called,
  // which propagates through the batch signals to the JSONL stream consumer.
  expect(abortSpy).toHaveBeenCalled();

  // Clean up — resolve the deferred so the server-side promise doesn't leak
  responseDeferred.resolve();
});

test('unsubscribing does not abort when the observable already completed', async () => {
  const t = initTRPC.create();
  const router = t.router({
    hello: t.procedure.query(() => 'world'),
  });

  await using ctx = testServerAndClientResource(router, {
    server: {},
    clientLink: 'httpBatchStreamLink',
  });

  const links = [
    httpBatchStreamLink({
      url: ctx.httpUrl,
    })(mockRuntime),
  ];

  const chain = createChain({
    links,
    op: {
      id: 1,
      type: 'query',
      path: 'hello',
      input: undefined,
      context: {},
      signal: null,
    },
  });

  // Wait for the observable to complete naturally (the response has arrived).
  let completed = false;
  await new Promise<void>((resolve) => {
    chain.subscribe({
      next() {
        // noop
      },
      complete() {
        completed = true;
        resolve();
      },
      error() {
        resolve();
      },
    });
  });

  // Natural completion still delivers the result — the teardown's abort only
  // fires on unsubscribe (isDone guard), so the happy path is unaffected.
  expect(completed).toBe(true);
});

test('signal is aborted after unsubscribe in a batched scenario', async () => {
  const requestArrived = createDeferred<void>();
  const responseDeferred = createDeferred<void>();

  const t = initTRPC.create();
  const router = t.router({
    slow: t.procedure.query(async () => {
      requestArrived.resolve();
      await responseDeferred.promise;
      return 'late';
    }),
    fast: t.procedure.query(() => 'fast'),
  });

  await using ctx = testServerAndClientResource(router, {
    server: {},
    clientLink: 'httpBatchStreamLink',
  });

  const links = [
    httpBatchStreamLink({
      url: ctx.httpUrl,
    })(mockRuntime),
  ];

  // Create two operations that will be batched together
  const slowChain = createChain({
    links,
    op: {
      id: 1,
      type: 'query',
      path: 'slow',
      input: undefined,
      context: {},
      signal: null,
    },
  });

  let fastResult: unknown;
  const fastChain = createChain({
    links,
    op: {
      id: 2,
      type: 'query',
      path: 'fast',
      input: undefined,
      context: {},
      signal: null,
    },
  });

  // Subscribe to the slow operation and unsubscribe quickly
  const slowSub = slowChain.subscribe({
    error() {
      // noop
    },
  });

  // Subscribe to the fast operation and wait for it to complete
  const fastDone = new Promise<void>((resolve) => {
    fastChain.subscribe({
      next(value) {
        fastResult = value.result.data;
      },
      complete() {
        resolve();
      },
      error() {
        resolve();
      },
    });
  });

  // Wait for the server to receive the request (batch dispatched)
  await requestArrived.promise;

  // Unsubscribe from the slow operation
  slowSub.unsubscribe();

  // Resolve the server so the fast result can come back
  responseDeferred.resolve();

  // The fast operation should still complete successfully
  await fastDone;
  expect(fastResult).toBe('fast');
});

test('aborts the stream consumer when the batch signal is already aborted before dispatch', async () => {
  // Gate that keeps the server procedure pending until we release it. If the
  // request is (incorrectly) sent, the procedure hangs and the test below times
  // out instead of settling.
  const responseDeferred = createDeferred<void>();

  const t = initTRPC.create();
  const router = t.router({
    slow: t.procedure.query(async () => {
      await responseDeferred.promise;
      return 'done';
    }),
  });

  await using ctx = testServerAndClientResource(router, {
    server: {},
    clientLink: 'httpBatchStreamLink',
  });

  // Spy on `AbortController.prototype.abort` so we can inspect the reason passed
  // to every instance (the spy still calls through, so aborts behave normally).
  // We deliberately use a non-`AbortError` reason for the operation signal below
  // so the only forwarded `AbortError` can come from the batch signal.
  const abortSpy = vi.spyOn(AbortController.prototype, 'abort');

  const links = [
    httpBatchStreamLink({
      url: ctx.httpUrl,
    })(mockRuntime),
  ];

  // The operation's signal is aborted *before* the chain runs, so the batch's
  // combined signal is already aborted when `fetch` builds the request.
  const opAbortController = new AbortController();
  opAbortController.abort(new Error('aborted before dispatch'));

  const chain = createChain({
    links,
    op: {
      id: 1,
      type: 'query',
      path: 'slow',
      input: undefined,
      context: {},
      signal: opAbortController.signal,
    },
  });

  // The observable must settle (it errors with the abort) rather than hang. A
  // hang here is the bug: the stream consumer would keep reading forever.
  const settled = await Promise.race([
    new Promise<'settled'>((resolve) => {
      chain.subscribe({
        next() {
          // noop
        },
        complete() {
          resolve('settled');
        },
        error() {
          resolve('settled');
        },
      });
    }),
    new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), 2000),
    ),
  ]);
  expect(settled).toBe('settled');

  // The stream consumer's `AbortController` must have been aborted with the
  // batch's abort reason (an `AbortError`). Without the eager-forward fix the
  // `addEventListener('abort', ...)` never fires for an already-aborted signal,
  // so no `AbortError` reason is ever forwarded.
  const forwardedAbortError = abortSpy.mock.calls.some(
    ([reason]) => reason instanceof Error && reason.name === 'AbortError',
  );
  expect(forwardedAbortError).toBe(true);

  // Clean up — resolve the deferred so the server-side promise doesn't leak
  responseDeferred.resolve();
});
