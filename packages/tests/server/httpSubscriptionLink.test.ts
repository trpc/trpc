import { EventEmitter, on } from 'node:events';
import { routerToServerAndClientNew, suppressLogs } from './___testHelpers';
import { waitFor } from '@testing-library/react';
import type { TRPCLink } from '@trpc/client';
import {
  createTRPCClient,
  splitLink,
  unstable_httpBatchStreamLink,
  unstable_httpSubscriptionLink,
} from '@trpc/client';
import type { TRPCCombinedDataTransformer } from '@trpc/server';
import { initTRPC, tracked, TRPCError } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { uneval } from 'devalue';
import { konn } from 'konn';
import superjson from 'superjson';
import { z } from 'zod';

const sleep = (ms = 1) => new Promise((resolve) => setTimeout(resolve, ms));

const orderedResults: number[] = [];
const ctx = konn()
  .beforeEach(() => {
    const onIterableInfiniteSpy =
      vi.fn<(args: { input: { lastEventId?: number } }) => void>();

    const ee = new EventEmitter();
    const eeEmit = (data: number | Error) => {
      ee.emit('data', data);
    };

    const t = initTRPC.create({
      transformer: superjson,
    });
    orderedResults.length = 0;
    const infiniteYields = vi.fn();

    const router = t.router({
      sub: {
        iterableEvent: t.procedure.subscription(async function* () {
          for await (const data of on(ee, 'data')) {
            const thing = data[0] as number | Error;

            if (thing instanceof Error) {
              throw thing;
            }
            yield thing;
          }
        }),

        iterableInfinite: t.procedure
          .input(
            z.object({
              lastEventId: z.coerce.number().min(0).optional(),
            }),
          )
          .subscription(async function* (opts) {
            onIterableInfiniteSpy({
              input: opts.input,
            });
            let idx = opts.input.lastEventId ?? 0;
            while (true) {
              yield tracked(String(idx), idx);
              idx++;
              await sleep();
              infiniteYields();
            }
          }),
      },
    });

    const linkSpy: TRPCLink<typeof router> = () => {
      // here we just got initialized in the app - this happens once per app
      // useful for storing cache for instance
      return ({ next, op }) => {
        // this is when passing the result to the next link
        // each link needs to return an observable which propagates results
        return observable((observer) => {
          const unsubscribe = next(op).subscribe({
            next(value) {
              orderedResults.push(value.result.data as number);
              observer.next(value);
            },
            error: observer.error,
          });
          return unsubscribe;
        });
      };
    };
    const opts = routerToServerAndClientNew(router, {
      server: {},
      client(opts) {
        return {
          links: [
            linkSpy,
            splitLink({
              condition: (op) => op.type === 'subscription',
              true: unstable_httpSubscriptionLink({
                url: opts.httpUrl,
                transformer: superjson,
              }),
              false: unstable_httpBatchStreamLink({
                url: opts.httpUrl,
                transformer: superjson,
              }),
            }),
          ],
        };
      },
    });
    return {
      ...opts,
      ee,
      eeEmit,
      infiniteYields,
      onIterableInfiniteSpy,
    };
  })
  .afterEach(async (opts) => {
    await opts?.close?.();
  })
  .done();

test('iterable event', async () => {
  const { client } = ctx;

  const onStarted = vi.fn<() => void>();
  const onData = vi.fn<(data: number) => void>();
  const subscription = client.sub.iterableEvent.subscribe(undefined, {
    onStarted: onStarted,
    onData(it) {
      onData(it);
    },
  });

  await waitFor(
    () => {
      expect(onStarted).toHaveBeenCalledTimes(1);
    },
    {
      timeout: 3_000,
    },
  );

  ctx.eeEmit(1);
  ctx.eeEmit(2);

  await waitFor(() => {
    expect(onData).toHaveBeenCalledTimes(2);
  });
  const onDataCalls = onData.mock.calls.map((call) => call[0]);
  expect(onDataCalls).toEqual([1, 2]);

  expect(ctx.ee.listenerCount('data')).toBe(1);

  subscription.unsubscribe();

  await waitFor(() => {
    expect(ctx.onReqAborted).toHaveBeenCalledTimes(1);
  });

  ctx.eeEmit(4);
  ctx.eeEmit(5);

  await waitFor(() => {
    expect(ctx.ee.listenerCount('data')).toBe(0);
  });
});

test(
  'iterable event with error',
  async () => {
    const { client } = ctx;

    const onStarted =
      vi.fn<(args: { context: Record<string, unknown> | undefined }) => void>();
    const onData = vi.fn<(args: number) => void>();
    const subscription = client.sub.iterableEvent.subscribe(undefined, {
      onStarted: onStarted,
      onData: onData,
    });

    await waitFor(() => {
      expect(onStarted).toHaveBeenCalledTimes(1);
    });
    ctx.eeEmit(1);

    await waitFor(() => {
      expect(onData).toHaveBeenCalledTimes(1);
    });

    const release = suppressLogs();
    ctx.eeEmit(new Error('test error'));
    await waitFor(
      async () => {
        expect(ctx.createContextSpy).toHaveBeenCalledTimes(2);
      },
      {
        timeout: 5_000,
      },
    );
    release();

    ctx.eeEmit(2);

    await waitFor(
      () => {
        expect(onData).toHaveBeenCalledTimes(2);
      },
      {
        timeout: 10_000,
      },
    );

    subscription.unsubscribe();
  },
  {
    timeout: 60_000,
  },
);

test('disconnect and reconnect with an event id', async () => {
  const { client } = ctx;

  const onStarted =
    vi.fn<(args: { context: Record<string, unknown> | undefined }) => void>();
  const onData = vi.fn<(args: { data: number; id: string }) => void>();
  const subscription = client.sub.iterableInfinite.subscribe(
    {},
    {
      onStarted: onStarted,
      onData,
    },
  );

  await waitFor(() => {
    expect(onStarted).toHaveBeenCalledTimes(1);
  });

  // @ts-expect-error lint makes this accessing annoying
  const es = onStarted.mock.calls[0]![0].context?.eventSource;
  assert(es instanceof EventSource);

  await waitFor(() => {
    expect(onData.mock.calls.length).toBeGreaterThan(5);
  });

  expect(onData.mock.calls[0]![0]).toEqual({
    data: 0,
    id: '0',
  });

  expect(ctx.onIterableInfiniteSpy).toHaveBeenCalledTimes(1);

  expect(es.readyState).toBe(EventSource.OPEN);
  const release = suppressLogs();
  ctx.destroyConnections();
  await waitFor(() => {
    expect(es.readyState).toBe(EventSource.CONNECTING);
  });
  release();

  await waitFor(
    () => {
      expect(es.readyState).toBe(EventSource.OPEN);
    },
    {
      timeout: 3_000,
    },
  );
  expect(ctx.onIterableInfiniteSpy).toHaveBeenCalledTimes(2);
  const lastCall = ctx.onIterableInfiniteSpy.mock.calls.at(-1)![0];

  expect(lastCall.input.lastEventId).toBeGreaterThan(5);

  subscription.unsubscribe();
  expect(es.readyState).toBe(EventSource.CLOSED);

  // const lastEventId = onData.mock.calls.at(-1)[0]![0]!
  await waitFor(() => {
    expect(ctx.onReqAborted).toHaveBeenCalledTimes(1);
  });
  await sleep(50);
  ctx.infiniteYields.mockClear();
  await sleep(50);
  expect(ctx.infiniteYields).toHaveBeenCalledTimes(0);
});

describe('auth / connectionParams', async () => {
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
          for await (const data of on(ee, 'data')) {
            const num = data[0] as number;
            yield {
              user: opts.ctx.user,
              num,
            };
          }
        }),
      });

      const opts = routerToServerAndClientNew(appRouter, {
        server: {
          async createContext(opts) {
            let user: User | null = null;
            if (opts.info.connectionParams?.['token'] === USER_TOKEN) {
              user = USER_MOCK;
            }

            return {
              user,
            };
          },
        },
      });

      return { ...opts, eeEmit };
    })
    .afterEach((ctx) => {
      return ctx.close?.();
    })
    .done();
  type AppRouter = typeof ctx.router;
  test('do a call without auth', async () => {
    const client = createTRPCClient<AppRouter>({
      links: [
        unstable_httpSubscriptionLink({
          url: ctx.httpUrl,
        }),
      ],
    });

    // sub
    const onStarted = vi.fn<() => void>();
    const onData = vi.fn<(args: { user: User | null; num: number }) => void>();
    const subscription = client.iterableEvent.subscribe(undefined, {
      onStarted: onStarted,
      onData: onData,
    });

    await waitFor(() => {
      expect(onStarted).toHaveBeenCalledTimes(1);
    });

    ctx.eeEmit(1);

    await waitFor(() => {
      expect(onData).toHaveBeenCalledTimes(1);
    });

    subscription.unsubscribe();

    expect(onData.mock.calls[0]![0]).toEqual({
      user: null,
      num: 1,
    });
  });

  test('with auth', async () => {
    const client = createTRPCClient<AppRouter>({
      links: [
        unstable_httpSubscriptionLink({
          url: ctx.httpUrl,

          connectionParams: async () => {
            return {
              token: USER_TOKEN,
            };
          },
        }),
      ],
    });

    // sub
    const onStarted = vi.fn<() => void>();
    const onData = vi.fn<(args: { user: User | null; num: number }) => void>();
    const subscription = client.iterableEvent.subscribe(undefined, {
      onStarted: onStarted,
      onData: onData,
    });

    await waitFor(() => {
      expect(onStarted).toHaveBeenCalledTimes(1);
    });

    ctx.eeEmit(1);

    await waitFor(() => {
      expect(onData).toHaveBeenCalledTimes(1);
    });

    subscription.unsubscribe();

    expect(onData.mock.calls[0]![0]).toEqual({
      user: USER_MOCK,
      num: 1,
    });
  });
});

describe('transformers / different serialize-deserialize', async () => {
  const transformer: TRPCCombinedDataTransformer = {
    input: superjson,
    output: {
      serialize: (object: any) => uneval(object),
      deserialize: (object: any) => {
        return eval(`(${object})`);
      },
    },
  };
  const t = initTRPC.create({ transformer });

  const ctx = konn()
    .beforeEach(() => {
      const ee = new EventEmitter();
      const eeEmit = (data: number) => {
        ee.emit('data', data);
      };

      const appRouter = t.router({
        iterableEvent: t.procedure.subscription(async function* () {
          for await (const data of on(ee, 'data')) {
            const num = data[0] as number;
            yield tracked(String(num), { num });
          }
        }),
      });

      const opts = routerToServerAndClientNew(appRouter, {});

      return { ...opts, eeEmit };
    })
    .afterEach((ctx) => {
      return ctx.close?.();
    })
    .done();

  type AppRouter = typeof ctx.router;
  test('serializes correctly', async () => {
    const client = createTRPCClient<AppRouter>({
      links: [
        unstable_httpSubscriptionLink({
          url: ctx.httpUrl,
          transformer,
        }),
      ],
    });

    const onStarted = vi.fn<() => void>();
    const onData =
      vi.fn<(args: { id: string; data: { num: number } }) => void>();
    const subscription = client.iterableEvent.subscribe(undefined, {
      onStarted: onStarted,
      onData: onData,
    });

    await waitFor(() => {
      expect(onStarted).toHaveBeenCalledTimes(1);
    });

    ctx.eeEmit(1);

    await waitFor(() => {
      expect(onData).toHaveBeenCalledTimes(1);
    });

    subscription.unsubscribe();

    expect(onData.mock.calls[0]![0]).toEqual({
      id: '1',
      data: { num: 1 },
    });
  });
});
