// @vitest-environment node
import { getEventListeners } from 'node:events';
import type { ServerResponse } from 'node:http';
import { testServerAndClientResource } from '../__tests__/testClientResource';
import { createTRPCUntypedClient, httpBatchLink, httpLink } from '@trpc/client';
import { initTRPC, TRPCError } from '@trpc/server';
import { createDeferred } from '@trpc/server/unstable-core-do-not-import';
import { describe, expect, test, vi } from 'vitest';

describe.each([
  ['httpLink', httpLink],
  ['httpBatchLink', httpBatchLink],
] as const)('%s abort listener cleanup', (_name, link) => {
  test.each(['success', 'procedure error', 'fetch error', 'body error'])(
    'removes caller listeners after %s',
    async (outcome) => {
      const controller = new AbortController();
      const originalListener = () => {
        // A caller-owned listener must survive request cleanup.
      };
      controller.signal.addEventListener('abort', originalListener);
      const client = createTRPCUntypedClient({
        links: [
          link({
            url: 'http://localhost',
            fetch: async () => {
              if (outcome === 'fetch error') throw new Error('Fetch failed');
              if (outcome === 'body error') return new Response('{');
              const result =
                outcome === 'procedure error'
                  ? {
                      error: {
                        message: 'Procedure failed',
                        code: -32600,
                        data: { code: 'BAD_REQUEST', httpStatus: 400 },
                      },
                    }
                  : { result: { data: 'ok' } };
              return new Response(
                JSON.stringify(link === httpBatchLink ? [result] : result),
              );
            },
          }),
        ],
      });
      for (let i = 0; i < 5; i++) {
        const request = client.query('value', undefined, {
          signal: controller.signal,
        });
        if (outcome === 'success') await expect(request).resolves.toBe('ok');
        else await expect(request).rejects.toBeInstanceOf(Error);
        expect(getEventListeners(controller.signal, 'abort')).toEqual([
          originalListener,
        ]);
      }
      expect(controller.signal.aborted).toBe(false);
    },
  );

  test('keeps cancellation connected while reading the response body', async () => {
    const body = createDeferred<unknown>();
    const reading = createDeferred<AbortSignal>();
    const controller = new AbortController();
    const client = createTRPCUntypedClient({
      links: [
        link({
          url: 'http://localhost',
          fetch: async (_url, init) => {
            const signal = init?.signal;
            if (!signal) throw new Error('Missing fetch signal');
            return {
              ok: true,
              json: () => {
                reading.resolve(signal);
                return body.promise;
              },
            };
          },
        }),
      ],
    });
    const request = client.query('value', undefined, {
      signal: controller.signal,
    });
    const rejected = expect(request).rejects.toBeInstanceOf(Error);
    const fetchSignal = await reading.promise;
    expect(fetchSignal.aborted).toBe(false);
    expect(
      getEventListeners(controller.signal, 'abort').length,
    ).toBeGreaterThan(0);
    controller.abort();
    expect(fetchSignal.aborted).toBe(true);
    body.reject(new Error('Body aborted'));
    await rejected;
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  });

  test('unsubscribe aborts an active fetch and removes caller listeners', async () => {
    const controller = new AbortController();
    const fetched = createDeferred<AbortSignal>();
    const response = createDeferred<Response>();
    const operation = link({
      url: 'http://localhost',
      fetch: async (_url, init) => {
        const signal = init?.signal;
        if (!signal) throw new Error('Missing fetch signal');
        fetched.resolve(signal);
        return response.promise;
      },
    })({});
    const subscription = operation({
      op: {
        id: 1,
        type: 'query',
        path: 'value',
        input: undefined,
        context: {},
        signal: controller.signal,
      },
      next: () => {
        throw new Error('Unexpected next link');
      },
    }).subscribe({});
    const fetchSignal = await fetched.promise;
    expect(fetchSignal.aborted).toBe(false);
    subscription.unsubscribe();
    expect(fetchSignal.aborted).toBe(true);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    response.reject(new Error('Fetch aborted'));
  });

  test('does not abort a successfully consumed response', async () => {
    const fetched = createDeferred<AbortSignal>();
    const client = createTRPCUntypedClient({
      links: [
        link({
          url: 'http://localhost',
          fetch: async (_url, init) => {
            const signal = init?.signal;
            if (!signal) throw new Error('Missing fetch signal');
            fetched.resolve(signal);
            const result = { result: { data: 'ok' } };
            return new Response(
              JSON.stringify(link === httpBatchLink ? [result] : result),
            );
          },
        }),
      ],
    });
    await expect(client.query('value')).resolves.toBe('ok');
    expect((await fetched.promise).aborted).toBe(false);
  });
});

test.each([
  [
    'FormData',
    () => new FormData(),
    'FormData is only supported for mutations',
  ],
  [
    'octet',
    () => new Uint8Array([1]),
    'Octet type input is only supported for mutations',
  ],
] as const)(
  'cleans caller abort listeners when %s request construction throws',
  async (_type, createInput, errorMessage) => {
    const controller = new AbortController();
    const originalListener = () => {
      // This caller-owned listener must survive request cleanup.
    };
    controller.signal.addEventListener('abort', originalListener);
    const client = createTRPCUntypedClient({
      links: [httpLink({ url: 'http://localhost' })],
    });

    await expect(
      client.query('value', createInput(), { signal: controller.signal }),
    ).rejects.toThrow(errorMessage);
    expect(getEventListeners(controller.signal, 'abort')).toEqual([
      originalListener,
    ]);
  },
);

test.each([false, true])(
  'batch cancellation: cancel remaining operation = %s',
  async (cancelRemaining) => {
    const first = new AbortController();
    const second = new AbortController();
    const controllers = [first, second];
    const body = createDeferred<unknown>();
    const reading = createDeferred<AbortSignal>();
    const client = createTRPCUntypedClient({
      links: [
        httpBatchLink({
          url: 'http://localhost',
          fetch: async (_url, init) => {
            const signal = init?.signal;
            if (!signal) throw new Error('Missing fetch signal');
            return {
              ok: true,
              json: () => {
                reading.resolve(signal);
                return body.promise;
              },
            };
          },
        }),
      ],
    });
    const firstRequest = client.query('value', undefined, {
      signal: first.signal,
    });
    const firstResult = cancelRemaining
      ? expect(firstRequest).rejects.toBeInstanceOf(Error)
      : expect(firstRequest).resolves.toBe('ok');
    const secondRequest = client.query('value', undefined, {
      signal: second.signal,
    });
    const secondResult = cancelRemaining
      ? expect(secondRequest).rejects.toBeInstanceOf(Error)
      : expect(secondRequest).resolves.toBe('ok');
    const fetchSignal = await reading.promise;
    first.abort();
    expect(fetchSignal.aborted).toBe(false);
    if (cancelRemaining) {
      second.abort();
      expect(fetchSignal.aborted).toBe(true);
      body.reject(new Error('Batch aborted'));
    } else {
      body.resolve([{ result: { data: 'ok' } }, { result: { data: 'ok' } }]);
    }
    await firstResult;
    await secondResult;
    for (const controller of controllers) {
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    }
  },
);

describe('httpBatchStreamLink abort listener cleanup', () => {
  const t = initTRPC.context<{ res: ServerResponse }>().create();
  const router = t.router({
    value: t.procedure.query(() => 'ok'),
    fail: t.procedure.query(() => {
      throw new TRPCError({ code: 'BAD_REQUEST' });
    }),
    ticks: t.procedure.query(async function* () {
      for (let i = 0; ; i++) {
        yield i;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }),
    dropsConnection: t.procedure.query(async function* ({ ctx }) {
      for (let i = 0; ; i++) {
        yield i;
        await new Promise((resolve) => setTimeout(resolve, 10));
        if (i === 2) ctx.res.destroy();
      }
    }),
  });

  test.each(['value', 'fail'] as const)(
    'removes caller listeners after %s',
    async (path) => {
      await using ctx = testServerAndClientResource(router, {
        clientLink: 'httpBatchStreamLink',
      });
      const controller = new AbortController();
      for (let i = 0; i < 5; i++) {
        await ctx.client[path]
          .query(undefined, { signal: controller.signal })
          .catch(() => null);
      }
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    },
  );

  test('keeps a streamed result cancellable after the query resolves', async () => {
    await using ctx = testServerAndClientResource(router, {
      clientLink: 'httpBatchStreamLink',
    });
    const controller = new AbortController();
    const ticks = await ctx.client.ticks.query(undefined, {
      signal: controller.signal,
    });
    const seen: number[] = [];
    await expect(async () => {
      for await (const tick of ticks) {
        seen.push(tick);
        if (tick === 2) controller.abort();
        if (tick === 10) break;
      }
    }).rejects.toThrow();
    expect(seen).toEqual([0, 1, 2]);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  });

  test('cancels a batch holding a failed query and a streamed query', async () => {
    await using ctx = testServerAndClientResource(router, {
      clientLink: 'httpBatchStreamLink',
    });
    const controller = new AbortController();
    const [, ticks] = await Promise.all([
      ctx.client.fail
        .query(undefined, { signal: controller.signal })
        .catch(() => null),
      ctx.client.ticks.query(undefined, { signal: controller.signal }),
    ]);
    const seen: number[] = [];
    await expect(async () => {
      for await (const tick of ticks) {
        seen.push(tick);
        if (tick === 2) controller.abort();
        if (tick === 10) break;
      }
    }).rejects.toThrow();
    expect(seen).toEqual([0, 1, 2]);
  });

  test('removes caller listeners when the response stream fails', async () => {
    await using ctx = testServerAndClientResource(router, {
      clientLink: 'httpBatchStreamLink',
    });
    const controller = new AbortController();
    const ticks = await ctx.client.dropsConnection.query(undefined, {
      signal: controller.signal,
    });
    await expect(async () => {
      for await (const _tick of ticks) {
        // drain until the connection drops
      }
    }).rejects.toThrow();
    await vi.waitFor(() =>
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0),
    );
  });
});
