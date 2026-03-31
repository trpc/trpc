import { EventEmitter, on } from 'node:events';
/// <reference types="vitest" />
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { createTRPCClient, httpFetchSubscriptionLink } from '@trpc/client';
import { FetchEventSource } from '@trpc/client/unstable-internals';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';

describe('httpFetchSubscriptionLink', () => {
  const noop = vi.fn();

  describe('headers', () => {
    const USER_TOKEN = 'supersecret';
    type User = {
      id: string;
      username: string;
    };
    const USER_MOCK = {
      id: '123',
      username: 'KATT',
    } as const satisfies User;
    const t = initTRPC
      .context<{
        user: User | null;
        op?: { type: string; path: string };
      }>()
      .create();

    const ctx = konn()
      .beforeEach(() => {
        const ee = new EventEmitter();
        const eeEmit = (data: number) => {
          ee.emit('data', data);
        };

        const appRouter = t.router({
          iterableEvent: t.procedure.subscription(async function* (opts) {
            for await (const data of on(ee, 'data', {
              signal: opts.signal,
            })) {
              const num = data[0] as number;
              yield {
                user: opts.ctx.user,
                op: opts.ctx.op,
                num,
              };
            }
          }),
        });

        const opts = testServerAndClientResource(appRouter, {
          server: {
            async createContext(opts) {
              let user: User | null = null;
              const token = opts.req?.headers?.['token'];
              if (token === USER_TOKEN) {
                user = USER_MOCK;
              }

              const type = opts.req?.headers?.['op-type'];
              const path = opts.req?.headers?.['op-path'];
              const op =
                typeof type === 'string' && typeof path === 'string'
                  ? { type, path }
                  : undefined;

              return {
                user,
                op,
              };
            },
          },
        });

        return { ...opts, eeEmit };
      })
      .afterEach((ctx) => ctx.close?.())
      .done();

    type AppRouter = typeof ctx.router;

    test('sends auth headers without an EventSource ponyfill', async () => {
      const client = createTRPCClient<AppRouter>({
        links: [
          httpFetchSubscriptionLink({
            url: ctx.httpUrl,
            headers: async ({ op }) => {
              return {
                token: USER_TOKEN,
                'op-type': op.type,
                'op-path': op.path,
              };
            },
          }),
        ],
      });

      const onStarted = vi.fn<() => void>();
      const onData =
        vi.fn<
          (args: {
            user: User | null;
            op?: { type: string; path: string };
            num: number;
          }) => void
        >();

      const subscription = client.iterableEvent.subscribe(undefined, {
        onStarted,
        onData,
      });

      await vi.waitFor(() => {
        expect(onStarted).toHaveBeenCalledTimes(1);
      });

      ctx.eeEmit(1);

      await vi.waitFor(() => {
        expect(onData).toHaveBeenCalledTimes(1);
      });

      subscription.unsubscribe();

      expect(onData.mock.calls[0]![0]).toEqual({
        user: USER_MOCK,
        op: { type: 'subscription', path: 'iterableEvent' },
        num: 1,
      });
    });

    test('forwards credentials to fetch', async () => {
      const credentialsSeen: RequestCredentials[] = [];
      const fetchSpy: typeof fetch = async (input, init) => {
        credentialsSeen.push(init?.credentials ?? 'same-origin');
        return fetch(input, init);
      };

      const client = createTRPCClient<AppRouter>({
        links: [
          httpFetchSubscriptionLink({
            url: ctx.httpUrl,
            fetch: fetchSpy,
            credentials: 'include',
          }),
        ],
      });

      const subscription = client.iterableEvent.subscribe(undefined, {
        onStarted: noop,
      });

      await vi.waitFor(() => {
        expect(credentialsSeen).toContain('include');
      });

      subscription.unsubscribe();
    });
  });

  test('FetchEventSource reconnects after an unexpected stream close', async () => {
    let requestCount = 0;
    const encoder = new TextEncoder();

    const eventSource = new FetchEventSource('http://example.com/sse', {
      fetch: async () => {
        requestCount++;
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode('event: connected\ndata: {}\n\n'),
              );
              controller.close();
            },
          }),
        );
      },
    });

    const onConnected = vi.fn();
    const onError = vi.fn();

    eventSource.addEventListener('connected', onConnected);
    eventSource.addEventListener('error', onError);

    await vi.waitFor(
      () => {
        expect(onConnected).toHaveBeenCalled();
        expect(onError).toHaveBeenCalled();
        expect(requestCount).toBeGreaterThanOrEqual(2);
      },
      { timeout: 3_000 },
    );

    eventSource.close();
  });

  test('FetchEventSource honors retry instructions from the SSE stream', async () => {
    let requestCount = 0;
    const encoder = new TextEncoder();

    const eventSource = new FetchEventSource('http://example.com/sse', {
      retry: 1_000,
      fetch: async () => {
        requestCount++;
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode('retry: 10\nevent: connected\ndata: {}\n\n'),
              );
              controller.close();
            },
          }),
        );
      },
    });

    await vi.waitFor(
      () => {
        expect(requestCount).toBeGreaterThanOrEqual(2);
      },
      { timeout: 500 },
    );

    eventSource.close();
  });
});
