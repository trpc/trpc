import { EventEmitter, on } from 'node:events';
import { IterableEventEmitter } from './../../server/src/__tests__/iterableEventEmitter';
/// <reference types="vitest" />
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { fakeTimersResource } from '@trpc/server/__tests__/fakeTimersResource';
import {
  suppressLogs,
  suppressLogsUntil,
} from '@trpc/server/__tests__/suppressLogs';
import type {
  OperationResultEnvelope,
  TRPCClientError,
  TRPCLink,
} from '@trpc/client';
import {
  createTRPCClient,
  httpBatchStreamLink,
  httpSubscriptionLink,
  splitLink,
} from '@trpc/client';
import type { TRPCConnectionState } from '@trpc/client/unstable-internals';
import type { TRPCCombinedDataTransformer } from '@trpc/server';
import { initTRPC, tracked } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import type {
  Deferred,
  RootConfig,
  Serialize,
  TrackedData,
} from '@trpc/server/unstable-core-do-not-import';
import {
  createDeferred,
  makeAsyncResource,
  run,
} from '@trpc/server/unstable-core-do-not-import';
import { makeResource } from '@trpc/server/unstable-core-do-not-import/stream/utils/disposable';
import { uneval } from 'devalue';
import { konn } from 'konn';
import superjson from 'superjson';
import { z } from 'zod';
import { zAsyncIterable } from './zAsyncIterable';

const sleep = (ms = 1) => new Promise((resolve) => setTimeout(resolve, ms));

const returnSymbol = Symbol();

type MyEvents = {
  data: [Error | number | typeof returnSymbol];
};
const orderedResults: number[] = [];
const ctx = konn()
  .beforeEach(() => {
    const onIterableInfiniteSpy =
      vi.fn<(args: { input: { lastEventId?: number } }) => void>();

    const ee = new IterableEventEmitter<MyEvents>();

    const t = initTRPC.create({
      transformer: superjson,
    });
    orderedResults.length = 0;
    const infiniteYields = vi.fn();

    const router = t.router({
      sub: {
        iterableEvent: t.procedure
          .output(
            zAsyncIterable({
              yield: z.number(),
              tracked: false,
            }),
          )
          .subscription(async function* (opts) {
            for await (const [thing] of ee.toIterable('data', {
              signal: opts.signal,
            })) {
              if (thing instanceof Error) {
                throw thing;
              }
              if (thing === returnSymbol) {
                return;
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
          .output(zAsyncIterable({ yield: z.number(), tracked: true }))
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
            complete: observer.complete,
          });
          return unsubscribe;
        });
      };
    };
    const opts = testServerAndClientResource(router, {
      server: {},
      client(opts) {
        return {
          links: [
            linkSpy,
            splitLink({
              condition: (op) => op.type === 'subscription',
              true: httpSubscriptionLink({
                url: opts.httpUrl,
                transformer: superjson,
              }),
              false: httpBatchStreamLink({
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

  await vi.waitFor(
    () => {
      expect(onStarted).toHaveBeenCalledTimes(1);
    },
    {
      timeout: 3_000,
    },
  );

  ctx.ee.emit('data', 1);
  ctx.ee.emit('data', 2);

  await vi.waitFor(() => {
    expect(onData).toHaveBeenCalledTimes(2);
  });
  const onDataCalls = onData.mock.calls.map((call) => call[0]);
  expect(onDataCalls).toEqual([1, 2]);

  expect(ctx.ee.listenerCount('data')).toBe(1);

  subscription.unsubscribe();

  await vi.waitFor(() => {
    expect(ctx.onReqAborted).toHaveBeenCalledTimes(1);
  });

  expect(ctx.onErrorSpy).not.toHaveBeenCalled();

  await vi.waitFor(() => {
    expect(ctx.ee.listenerCount('data')).toBe(0);
  });
});

test(
  'iterable event with error',
  {
    timeout: 60_000,
  },
  async () => {
    const { client } = ctx;

    const onStarted =
      vi.fn<(args: { context: Record<string, unknown> | undefined }) => void>();
    const onData = vi.fn<(args: number) => void>();
    const onConnectionStateChange =
      vi.fn<
        (args: TRPCConnectionState<TRPCClientError<typeof ctx.router>>) => void
      >();
    const subscription = client.sub.iterableEvent.subscribe(undefined, {
      onStarted: onStarted,
      onData: onData,
      onConnectionStateChange,
    });

    await vi.waitFor(() => {
      expect(onStarted).toHaveBeenCalledTimes(1);
    });
    ctx.ee.emit('data', 1);

    await vi.waitFor(() => {
      expect(onData).toHaveBeenCalledTimes(1);
    });

    ctx.ee.emit('data', new Error('test error'));

    await suppressLogsUntil(async () => {
      await vi.waitFor(
        async () => {
          expect(ctx.createContextSpy).toHaveBeenCalledTimes(2);
        },
        {
          timeout: 5_000,
        },
      );
    });

    ctx.ee.emit('data', 2);

    await vi.waitFor(
      () => {
        expect(onData).toHaveBeenCalledTimes(2);
      },
      {
        timeout: 10_000,
      },
    );

    subscription.unsubscribe();

    expect(onConnectionStateChange.mock.calls).toMatchInlineSnapshot(`
      Array [
        Array [
          Object {
            "error": null,
            "state": "connecting",
            "type": "state",
          },
        ],
        Array [
          Object {
            "error": null,
            "state": "pending",
            "type": "state",
          },
        ],
        Array [
          Object {
            "error": [TRPCClientError: test error],
            "state": "connecting",
            "type": "state",
          },
        ],
        Array [
          Object {
            "error": [TRPCClientError: Unknown error],
            "state": "connecting",
            "type": "state",
          },
        ],
        Array [
          Object {
            "error": null,
            "state": "pending",
            "type": "state",
          },
        ],
      ]
    `);
  },
);

test('iterable event with bad yield', async () => {
  const onStarted = vi.fn<() => void>();
  const onData = vi.fn<(data: number) => void>();
  const onError = vi.fn<(err: TRPCClientError<typeof ctx.router>) => void>();
  const subscription = ctx.client.sub.iterableEvent.subscribe(undefined, {
    onStarted: onStarted,
    onData(it) {
      onData(it);
    },
    onError: onError,
  });

  await vi.waitFor(() => {
    expect(onStarted).toHaveBeenCalledTimes(1);
  });

  ctx.ee.emit('data', 1);
  ctx.ee.emit('data', 'NOT_A_NUMBER' as never);
  await vi.waitFor(() => {
    expect(ctx.onErrorSpy).toHaveBeenCalledTimes(1);
  });
  const serverError = ctx.onErrorSpy.mock.calls[0]![0].error;
  expect(serverError.code).toBe('INTERNAL_SERVER_ERROR');
  expect(serverError.message).toMatchInlineSnapshot(`
    "[
      {
        "expected": "number",
        "code": "invalid_type",
        "path": [],
        "message": "Invalid input: expected number, received string"
      }
    ]"
  `);

  subscription.unsubscribe();
});

test('disconnect and reconnect with an event id', async () => {
  const { client } = ctx;

  const onStarted =
    vi.fn<(args: { context: Record<string, unknown> | undefined }) => void>();
  const onData = vi.fn<(args: { data: number; id: string }) => void>();

  const onConnectionStateChange =
    vi.fn<
      (args: TRPCConnectionState<TRPCClientError<typeof ctx.router>>) => void
    >();
  const subscription = client.sub.iterableInfinite.subscribe(
    {},
    {
      onStarted: onStarted,
      onData(d) {
        onData(d);
      },
      onConnectionStateChange,
    },
  );

  await vi.waitFor(() => {
    expect(onStarted).toHaveBeenCalledTimes(1);
  });

  // @ts-expect-error lint makes this accessing annoying
  const es = onStarted.mock.calls[0]![0].context?.eventSource;
  assert(es instanceof EventSource);

  await vi.waitFor(() => {
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
  await vi.waitFor(() => {
    expect(es.readyState).toBe(EventSource.CONNECTING);
  });

  release();

  const lastState = onConnectionStateChange.mock.calls.at(-1)![0];

  expect(lastState.state).toBe('connecting');
  expect(lastState.error).not.toBeNull();
  expect(lastState.error).toMatchInlineSnapshot(
    `[TRPCClientError: Unknown error]`,
  );

  await vi.waitFor(
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
  await vi.waitFor(() => {
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
          for await (const data of on(ee, 'data', {
            signal: opts.signal,
          })) {
            const num = data[0] as number;
            yield {
              user: opts.ctx.user,
              num,
            };
          }
        }),
      });

      const opts = testServerAndClientResource(appRouter, {
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
        httpSubscriptionLink({
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

    await vi.waitFor(() => {
      expect(onStarted).toHaveBeenCalledTimes(1);
    });

    ctx.eeEmit(1);

    await vi.waitFor(() => {
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
        httpSubscriptionLink({
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
      num: 1,
    });
  });
});

describe('headers / eventSourceOptions', async () => {
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

            let op: { type: string; path: string } | undefined;
            if (typeof type === 'string' && typeof path === 'string') {
              op = { type, path };
            }

            return {
              user,
              op,
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
        httpSubscriptionLink({
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

    await vi.waitFor(() => {
      expect(onStarted).toHaveBeenCalledTimes(1);
    });

    ctx.eeEmit(1);

    await vi.waitFor(() => {
      expect(onData).toHaveBeenCalledTimes(1);
    });

    subscription.unsubscribe();

    expect(onData.mock.calls[0]![0]).toEqual({
      user: null,
      op: undefined,
      num: 1,
    });
  });

  test('with auth', async () => {
    const client = createTRPCClient<AppRouter>({
      links: [
        httpSubscriptionLink({
          url: ctx.httpUrl,

          eventSourceOptions: async ({ op }) => {
            return {
              headers: {
                token: USER_TOKEN,
                'op-type': op.type,
                'op-path': op.path,
              },
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
        iterableEvent: t.procedure.subscription(async function* (opts) {
          for await (const data of on(ee, 'data', {
            signal: opts.signal,
          })) {
            const num = data[0] as number;
            yield tracked(String(num), { num });
          }
        }),
      });

      const opts = testServerAndClientResource(appRouter, {});

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
        httpSubscriptionLink({
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

    await vi.waitFor(() => {
      expect(onStarted).toHaveBeenCalledTimes(1);
    });

    ctx.eeEmit(1);

    await vi.waitFor(() => {
      expect(onData).toHaveBeenCalledTimes(1);
    });

    subscription.unsubscribe();

    expect(onData.mock.calls[0]![0]).toEqual({
      id: '1',
      data: { num: 1 },
    });
  });
});

describe('timeouts', async () => {
  interface CtxOpts {
    sse?: RootConfig<any>['sse'];
  }
  const getCtx = (ctxOpts: CtxOpts) => {
    const results: number[] = [];

    const fakeTimers = fakeTimersResource();

    const onConnection = vi.fn<() => void>();

    const t = initTRPC.create({
      transformer: superjson,
      sse: ctxOpts.sse,
    });

    let deferred: Deferred<void> = createDeferred();

    const router = t.router({
      infinite: t.procedure
        .input(
          z
            .object({
              lastEventId: z.coerce.number().min(0).optional(),
            })
            .optional(),
        )
        .subscription(async function* (opts) {
          onConnection();
          let idx = opts.input?.lastEventId ?? 0;
          while (true) {
            idx++;
            await deferred.promise;
            deferred = createDeferred();
            yield tracked(String(idx), idx);
          }
        }),
    });

    const operations: OperationResultEnvelope<
      unknown,
      TRPCClientError<typeof router>
    >[] = [];

    const linkSpy: TRPCLink<typeof router> = () => {
      // here we just got initialized in the app - this happens once per app
      // useful for storing cache for instance
      return ({ next, op }) => {
        // this is when passing the result to the next link
        // each link needs to return an observable which propagates results
        return observable((observer) => {
          const unsubscribe = next(op).subscribe({
            next(envelope) {
              if (!envelope.result.type || envelope.result.type === 'data') {
                results.push((envelope.result.data as any).data);
              }

              const op = { ...envelope };
              if (op.context?.['eventSource']) {
                op.context['eventSource'] = '[redacted]';
              }
              operations.push(envelope);
              observer.next(envelope);
            },
            error: observer.error,
            complete: observer.complete,
          });
          return unsubscribe;
        });
      };
    };
    const opts = testServerAndClientResource(router, {
      server: {},
      client(opts) {
        return {
          links: [
            linkSpy,
            httpSubscriptionLink({
              url: opts.httpUrl,
              transformer: superjson,
            }),
          ],
        };
      },
    });
    return makeAsyncResource(
      {
        ...opts,
        deferred: () => deferred,
        results: results,
        operations: operations,
        onConnection,
      },
      async () => {
        vi.useRealTimers();
      },
    );
  };

  test('works', async () => {
    const opts = {
      sse: {
        client: {
          reconnectAfterInactivityMs: 1_000,
        },
      },
    } as const satisfies CtxOpts;

    await using ctx = getCtx(opts);
    const sub = ctx.client.infinite.subscribe(undefined, {});

    ctx.deferred().resolve();

    await vi.waitFor(async () => {
      expect(ctx.results).toHaveLength(1);
    });

    await vi.advanceTimersByTimeAsync(
      opts.sse.client.reconnectAfterInactivityMs + 100,
    );

    await vi.waitFor(async () => {
      expect(ctx.onConnection).toHaveBeenCalledTimes(2);
    });

    ctx.deferred().resolve();

    await vi.waitFor(async () => {
      expect(ctx.results).toEqual([1, 2]);
    });

    const connectedOpts = ctx.operations
      .map((op) => op.result)
      .filter((op) => op.type === 'state' && op.state === 'connecting');

    expect(connectedOpts).toHaveLength(2);

    const last = connectedOpts.at(-1)!;
    expect(last.error).not.toBeFalsy();
    expect(last.error).toMatchInlineSnapshot(
      `[TRPCClientError: Timeout of 1000ms reached while waiting for a response]`,
    );

    sub.unsubscribe();
  });

  test('does not timeout if ping is enabled', async () => {
    const opts = {
      sse: {
        ping: {
          enabled: true,
          intervalMs: 1_000,
        },
        client: {
          reconnectAfterInactivityMs: 10_000,
        },
      },
    } as const satisfies CtxOpts;

    await using ctx = getCtx(opts);
    const sub = ctx.client.infinite.subscribe(undefined, {});

    ctx.deferred().resolve();

    await vi.waitFor(async () => {
      expect(ctx.results).toHaveLength(1);
    });

    await vi.advanceTimersByTimeAsync(
      opts.sse.client.reconnectAfterInactivityMs * 10,
    );

    expect(ctx.onConnection).toHaveBeenCalledTimes(1);

    ctx.deferred().resolve();

    await vi.waitFor(async () => {
      expect(ctx.results).toEqual([1, 2]);
    });

    const connectedOpts = ctx.operations
      .map((op) => op.result)
      .filter((op) => op.type === 'state' && op.state === 'connecting');

    expect(connectedOpts).toHaveLength(1);

    sub.unsubscribe();
  });
});

test('cancel subscription by returning on the server', async () => {
  const onStartedSpy = vi.fn();
  const onDataSpy = vi.fn();
  const onCompleteSpy = vi.fn();
  const onErrorSpy = vi.fn();
  const onStoppedSpy = vi.fn();
  const onConnectionStateChangeSpy = vi.fn();
  const sub = ctx.client.sub.iterableEvent.subscribe(undefined, {
    onData: onDataSpy,
    onStarted: onStartedSpy,
    onComplete: onCompleteSpy,
    onError: onErrorSpy,
    onStopped: onStoppedSpy,
    onConnectionStateChange: onConnectionStateChangeSpy,
  });

  await vi.waitFor(() => {
    expect(onStartedSpy).toHaveBeenCalledTimes(1);
  });

  const es = onStartedSpy.mock.calls[0]![0].context?.eventSource;
  assert(es instanceof EventSource);

  expect(es.readyState).toBe(EventSource.OPEN);

  // yield
  ctx.ee.emit('data', 1);

  await vi.waitFor(() => {
    expect(onDataSpy).toHaveBeenCalledTimes(1);
  });
  expect(onDataSpy.mock.calls).toMatchInlineSnapshot(`
    Array [
      Array [
        1,
      ],
    ]
  `);
  expect(es.readyState).toBe(EventSource.OPEN);
  ctx.ee.emit('data', returnSymbol);

  await vi.waitFor(() => {
    expect(onStoppedSpy).toHaveBeenCalledTimes(1);
  });
  await vi.waitFor(() => {
    expect(onCompleteSpy).toHaveBeenCalledTimes(1);
  });

  expect(onConnectionStateChangeSpy.mock.calls.flat()).toMatchInlineSnapshot(`
    Array [
      Object {
        "error": null,
        "state": "connecting",
        "type": "state",
      },
      Object {
        "error": null,
        "state": "pending",
        "type": "state",
      },
      Object {
        "error": null,
        "state": "idle",
        "type": "state",
      },
    ]
  `);

  expect(es.readyState).toBe(EventSource.CLOSED);

  expect(onErrorSpy).not.toHaveBeenCalled();

  sub.unsubscribe();
});

function createPuller(): PromiseLike<void> & {
  pull: () => void;
  reject: (err: unknown) => void;
} {
  let deferred = createDeferred();

  return {
    pull: () => {
      deferred.resolve();
    },
    reject: (err: unknown) => {
      deferred.reject(err);
    },
    then(onFulfilled, onRejected) {
      return deferred.promise.then(onFulfilled, onRejected).then((res) => {
        deferred = createDeferred();
        return res;
      });
    },
  };
}

test('tracked() without transformer', async () => {
  /**
   * Test resource
   */
  function getCtxResource() {
    const t = initTRPC.create({});

    const puller = createPuller();
    const finallySpy = vi.fn();
    const onAbortSpy = vi.fn();

    const router = t.router({
      iterableInfinite: t.procedure
        .input(
          z.object({
            lastEventId: z.coerce.number().min(0).optional(),
          }),
        )
        .subscription(async function* (opts) {
          opts.signal?.addEventListener(
            'abort',
            (reason) => {
              onAbortSpy(reason);
              puller.reject(reason);
            },
            { once: true },
          );
          try {
            let idx = opts.input.lastEventId ?? 0;
            while (!opts.signal!.aborted) {
              idx++;
              yield tracked(String(idx), idx);
              await puller;
            }
          } finally {
            finallySpy();
          }
        }),
    });

    const opts = testServerAndClientResource(router, {
      server: {},
      client(opts) {
        return {
          links: [
            splitLink({
              condition: (op) => op.type === 'subscription',
              true: httpSubscriptionLink({
                url: opts.httpUrl,
              }),
              false: httpBatchStreamLink({
                url: opts.httpUrl,
              }),
            }),
          ],
        };
      },
    });
    return {
      ...opts,
      puller,
      finallySpy,
      onAbortSpy,
    };
  }
  await using ctx = getCtxResource();

  const results: number[] = [];

  const sub = ctx.client.iterableInfinite.subscribe(
    {},
    {
      onData: (envelope) => {
        expectTypeOf(envelope.data).toBeNumber();

        results.push(envelope.data);
      },
    },
  );

  await vi.waitFor(() => {
    expect(results).toHaveLength(1);
  });

  ctx.puller.pull();

  await vi.waitFor(() => {
    expect(results).toHaveLength(2);
  });

  ctx.puller.pull();

  await vi.waitFor(() => {
    expect(results).toEqual([1, 2, 3]);
  });

  sub.unsubscribe();

  await vi.waitFor(() => {
    expect(ctx.finallySpy).toHaveBeenCalledTimes(1);
  });
});

// regression test for https://github.com/trpc/trpc/issues/6193
test('server should not hang when client cancels subscription', async () => {
  await using ctx = run(() => {
    const t = initTRPC.create();

    const onFinally = vi.fn();
    const onError = vi.fn();
    const router = t.router({
      sub: t.procedure.subscription(async function* (opts) {
        assert(opts.signal, 'no signal received');
        try {
          let idx = 0;
          while (!opts.signal.aborted) {
            yield `hi ${idx++}`;
            // We must yield to the event loop to allow I/O events to be processed.
            // `await sleep(0)` uses `setTimeout(..., 0)`, which schedules a "macrotask".
            // This allows the event loop to complete its current work, process I/O (like a client disconnect),
            // and then resume the generator.
            //
            // Using `await new Promise(resolve => process.nextTick(resolve))` or `await Promise.resolve()` would not work.
            // They schedule "microtasks" which would execute before the next event loop phase,
            // creating a "hot loop" that starves I/O and prevents the disconnect event from being processed.
            await sleep(0);
          }
        } catch (err) {
          onError(err);
        } finally {
          expect(opts.signal.aborted).toBe(true);
          onFinally();
        }
      }),
    });

    const opts = testServerAndClientResource(router);
    return {
      ...opts,
      onFinally,
      onError,
    };
  });

  const results = await new Promise<string[]>((resolve) => {
    const results: string[] = [];

    const sub = ctx.client.sub.subscribe(undefined, {
      onData: (data) => {
        results.push(data);
        if (results.length === 3) {
          sub.unsubscribe();
          resolve(results);
        }
      },
    });
  });

  await vi.waitFor(() => {
    expect(ctx.onFinally).toHaveBeenCalledTimes(1);
  });
  expect(ctx.onError).not.toHaveBeenCalled();

  expect(results).toMatchInlineSnapshot(`
    Array [
      "hi 0",
      "hi 1",
      "hi 2",
    ]
  `);
});

test('recipe: pull data in a loop', async () => {
  type Post = {
    id: string;
    title: string;
    createdAt: Date;
  };
  await using ctx = run(() => {
    const t = initTRPC.create();

    const posts: Post[] = [
      {
        id: '1',
        title: 'Post 1',
        createdAt: new Date('2021-01-01'),
      },
    ];

    function addPost(post: Post) {
      posts.push(post);
    }

    async function getPosts(lastEventId: Date | null): Promise<Post[]> {
      if (!lastEventId) {
        return posts;
      }
      return posts.filter((post) => post.createdAt > lastEventId);
    }

    const onFinally = vi.fn();
    const onError = vi.fn();
    const router = t.router({
      sub: t.procedure
        .input(
          z.object({
            lastEventId: z.coerce.date().nullish(),
          }),
        )
        .subscription(async function* (opts) {
          assert(opts.signal, 'no signal received');
          try {
            let lastEventId = opts.input.lastEventId ?? null;
            while (!opts.signal.aborted) {
              const posts = await getPosts(lastEventId);
              for (const post of posts) {
                yield tracked(post.createdAt.toJSON(), post);
                lastEventId = post.createdAt;
              }
              // Sleep to allow I/O events to be processed.
              // In a real app, it'd prob be `sleep(1000)` or similar
              await sleep(0);
            }
          } catch (err) {
            onError(err);
          } finally {
            expect(opts.signal.aborted).toBe(true);
            onFinally();
          }
        }),
    });

    const opts = testServerAndClientResource(router);
    return {
      ...opts,
      onFinally,
      onError,
      addPost,
    };
  });

  const receivedPosts: TrackedData<Serialize<Post>>[] = [];

  const sub = ctx.client.sub.subscribe(
    {} /* initial input */,
    {
      onData: (data) => {
        receivedPosts.push(data);
      },
    },
  );

  // wait for initial post
  await vi.waitFor(() => {
    expect(receivedPosts).toHaveLength(1);
  });

  // add a new post and wait for it to be received
  ctx.addPost({
    id: '2',
    title: 'Post 2',
    createdAt: new Date('2021-01-02'),
  });

  await vi.waitFor(() => {
    expect(receivedPosts).toHaveLength(2);
  });

  sub.unsubscribe();

  await vi.waitFor(() => {
    expect(ctx.onFinally).toHaveBeenCalledTimes(1);
  });
  expect(ctx.onError).not.toHaveBeenCalled();

  expect(receivedPosts.map((p) => p.data.title)).toMatchInlineSnapshot(`
    Array [
      "Post 1",
      "Post 2",
    ]
  `);
});

// regression test for https://github.com/trpc/trpc/issues/6991
test('maxDurationMs should abort subscription even when not yielding', async () => {
  const MAX_DURATION_MS = 100;

  using fakeTimers = fakeTimersResource();
  await using ctx = run(() => {
    const t = initTRPC.create({
      sse: {
        maxDurationMs: MAX_DURATION_MS,
      },
    });

    const onSignalAborted = vi.fn();
    const onFinally = vi.fn();

    const router = t.router({
      // biome-ignore lint/correctness/useYield: intentionally non-yielding to test maxDurationMs abort behavior
      sub: t.procedure.subscription(async function* (opts) {
        assert(opts.signal, 'no signal received');
        try {
          // Listen for abort signal
          opts.signal.addEventListener('abort', onSignalAborted);

          // Simulate a subscription that never yields - just waits forever
          // This should be interrupted by maxDurationMs via the abort signal
          while (!opts.signal.aborted) {
            await sleep(10);
          }
        } finally {
          onFinally();
        }
      }),
    });

    const opts = testServerAndClientResource(router);
    return {
      ...opts,
      onSignalAborted,
      onFinally,
    };
  });

  const onError = vi.fn();
  const onStarted = vi.fn();
  const sub = ctx.client.sub.subscribe(undefined, {
    onError,
    onStarted,
  });
  await vi.waitFor(() => {
    expect(onStarted).toHaveBeenCalledTimes(1);
  });

  await fakeTimers.advanceTimersByTimeAsync(MAX_DURATION_MS);

  expect(ctx.onSignalAborted).toHaveBeenCalledTimes(1);

  // Verify the subscription handler completed
  await vi.waitFor(() => {
    expect(ctx.onFinally).toHaveBeenCalledTimes(1);
  });
  expect(onError).not.toHaveBeenCalled();

  sub.unsubscribe();
});

test('timer does not leak after subscription ends', async () => {
  const nonce = Math.floor(Math.random() * 1000);
  const MAX_DURATION_MS = 60_000 * 60 * 24 + nonce; // 1 day + nonce

  using timeoutSpies = run(() => {
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
    return makeResource(
      {
        setTimeoutSpy,
        clearTimeoutSpy,
      },
      () => {
        setTimeoutSpy.mockReset();
        clearTimeoutSpy.mockReset();
      },
    );
  });

  await using ctx = run(() => {
    const t = initTRPC.create({
      sse: {
        maxDurationMs: MAX_DURATION_MS,
      },
    });

    const onSignalAborted = vi.fn();
    const onFinally = vi.fn();

    const router = t.router({
      // biome-ignore lint/correctness/useYield: intentionally non-yielding to test maxDurationMs abort behavior
      sub: t.procedure.subscription(async function* (opts) {
        assert(opts.signal, 'no signal received');
        try {
          // Listen for abort signal
          opts.signal.addEventListener('abort', onSignalAborted);

          // Simulate a subscription that never yields - just waits forever
          // This should be interrupted by maxDurationMs via the abort signal
          while (!opts.signal.aborted) {
            await sleep(10);
          }
        } finally {
          onFinally();
        }
      }),
    });

    const opts = testServerAndClientResource(router);
    return {
      ...opts,
      onSignalAborted,
      onFinally,
    };
  });

  const onError = vi.fn();
  const onStarted = vi.fn();
  const sub = ctx.client.sub.subscribe(undefined, {
    onError,
    onStarted,
  });
  await vi.waitFor(() => {
    expect(onStarted).toHaveBeenCalledTimes(1);
  });
  // calls to setTimeout:
  const maxDurationTimerIndex = timeoutSpies.setTimeoutSpy.mock.calls.findIndex(
    (args) => args[1] === MAX_DURATION_MS,
  );
  expect(maxDurationTimerIndex).not.toBe(-1);
  const maxDurationTimerResult =
    timeoutSpies.setTimeoutSpy.mock.results[maxDurationTimerIndex];
  assert(maxDurationTimerResult?.type === 'return');

  expect(timeoutSpies.clearTimeoutSpy).not.toHaveBeenCalledWith(
    maxDurationTimerResult.value,
  );

  sub.unsubscribe();

  // Verify the subscription handler completed
  await vi.waitFor(() => {
    expect(ctx.onFinally).toHaveBeenCalledTimes(1);
  });

  expect(timeoutSpies.clearTimeoutSpy).toHaveBeenCalledWith(
    maxDurationTimerResult.value,
  );
});
