// @vitest-environment node
import { getEventListeners } from 'node:events';
import { createTRPCUntypedClient, httpBatchLink, httpLink } from '@trpc/client';
import { createDeferred } from '@trpc/server/unstable-core-do-not-import';
import { describe, expect, test } from 'vitest';

describe.each([httpLink, httpBatchLink])(
  '%s abort listener cleanup',
  (link) => {
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
