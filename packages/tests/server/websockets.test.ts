import { EventEmitter, on } from 'node:events';
/// <reference types="vitest" />
import '@testing-library/react';
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import type { TRPCServerResourceOpts } from '@trpc/server/__tests__/trpcServerResource';
import { waitError } from '@trpc/server/__tests__/waitError';
import type { TRPCClientError, WebSocketClientOptions } from '@trpc/client';
import { createTRPCClient, createWSClient, wsLink } from '@trpc/client';
import type { TRPCConnectionState } from '@trpc/client/unstable-internals';
import type { AnyRouter } from '@trpc/server';
import { initTRPC, tracked, TRPCError } from '@trpc/server';
import type { WSSHandlerOptions } from '@trpc/server/adapters/ws';
import type { Observable, Observer } from '@trpc/server/observable';
import {
  observable,
  observableToAsyncIterable,
  tap,
} from '@trpc/server/observable';
import type {
  TRPCClientOutgoingMessage,
  TRPCRequestMessage,
  TRPCResponse,
} from '@trpc/server/rpc';
import type { DefaultErrorShape } from '@trpc/server/unstable-core-do-not-import';
import {
  createDeferred,
  run,
  sleep,
} from '@trpc/server/unstable-core-do-not-import';
import type {
  LegacyObservableSubscriptionProcedure,
  SubscriptionProcedure,
} from '@trpc/server/unstable-core-do-not-import/procedure';
import WebSocket from 'ws';
import { z } from 'zod';

/**
 * @deprecated should not be needed - use deferred instead
 */
async function waitMs(ms: number) {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

type Message = {
  id: string;
  title: string;
};

function factory(config?: {
  createContext?: () => Promise<any>;
  wsClient?: Partial<WebSocketClientOptions>;
  wssServer?: Partial<WSSHandlerOptions<AnyRouter>>;
}) {
  const ee = new EventEmitter();

  const subRef: {
    current: Observer<Message, unknown>;
  } = {} as any;
  const onNewMessageSubscription = vi.fn();
  const subscriptionEnded = vi.fn();

  const onSlowMutationCalled = vi.fn();

  const t = initTRPC.create();

  let iterableDeferred = createDeferred();
  const nextIterable = () => {
    iterableDeferred.resolve();
    iterableDeferred = createDeferred();
  };

  const appRouter = t.router({
    greeting: t.procedure.input(z.string().nullish()).query(({ input }) => {
      return `hello ${input ?? 'world'}`;
    }),

    mut: t.procedure.mutation(async ({}) => {
      onSlowMutationCalled();
      return 'mutation resolved';
    }),
    iterable: t.procedure
      .input(
        z
          .object({
            lastEventId: z.coerce.number().nullish(),
          })
          .nullish(),
      )
      .subscription(async function* (opts) {
        let from = opts?.input?.lastEventId ?? 0;

        while (true) {
          from++;
          await iterableDeferred.promise;
          const msg: Message = {
            id: String(from),
            title: 'hello ' + from,
          };

          yield tracked(String(from), msg);
        }
      }),

    postEdit: t.procedure
      .input(
        z.object({
          id: z.string(),
          data: z.object({
            title: z.string(),
            text: z.string(),
          }),
        }),
      )
      .mutation(({ input }) => {
        const { id, data } = input;
        return {
          id,
          ...data,
        };
      }),

    onMessageObservable: t.procedure
      .input(z.string().nullish())
      .subscription(() => {
        const sub = observable<Message>((emit) => {
          subRef.current = emit;
          const onMessage = (data: Message) => {
            emit.next(data);
          };
          ee.on('server:msg', onMessage);
          const onError = (error: unknown) => {
            emit.error(error);
          };
          ee.on('observable:error', onError);
          return () => {
            subscriptionEnded();
            ee.off('server:msg', onMessage);
            ee.off('observable:error', onError);
          };
        });
        ee.emit('subscription:created');
        onNewMessageSubscription();
        return sub;
      }),

    onMessageIterable: t.procedure
      .input(z.string().nullish())
      .subscription(async function* (opts) {
        ee.emit('subscription:created');
        onNewMessageSubscription();

        for await (const data of on(ee, 'server:msg', {
          signal: opts.signal,
        })) {
          yield data[0] as Message;
        }
      }),
  });

  const onOpenMock = vi.fn();
  const onErrorMock = vi.fn();
  const onCloseMock = vi.fn();

  expectTypeOf(appRouter).toMatchTypeOf<AnyRouter>();
  // TODO: Uncomment when the expect-type library gets fixed
  // expectTypeOf<AnyRouter>().toMatchTypeOf<typeof appRouter>();

  const connectionState =
    vi.fn<Observer<TRPCConnectionState<unknown>, never>['next']>();

  const opts = testServerAndClientResource(appRouter, {
    wsClient: {
      lazy: {
        enabled: false,
        closeMs: 0,
      },
      retryDelayMs: () => 50,
      onOpen: onOpenMock,
      onError: onErrorMock,
      onClose: onCloseMock,
      ...config?.wsClient,
    },
    client({ wsClient }) {
      wsClient.connectionState.subscribe({ next: connectionState });
      return {
        links: [wsLink({ client: wsClient })],
      };
    },
    server: {
      ...(config ?? {}),
    },
    wssServer: {
      ...config?.wssServer,
      createContext: config?.createContext ?? (() => ({})),
      router: appRouter,
    },
  });

  return {
    ...opts,
    ee,
    subRef,
    onNewMessageSubscription,
    onOpenMock,
    onErrorMock,
    onCloseMock,
    onSlowMutationCalled,
    subscriptionEnded,
    nextIterable,
    connectionState,
  };
}

test('query', async () => {
  await using ctx = factory();
  expect(await ctx.client.greeting.query()).toBe('hello world');
  expect(await ctx.client.greeting.query(null)).toBe('hello world');
  expect(await ctx.client.greeting.query('alexdotjs')).toBe('hello alexdotjs');

  const states = ctx.connectionState.mock.calls.map((c) => c[0]?.state);
  expect(states).toContain('connecting');
  expect(states).toContain('pending');
});

test.each([
  [1n, 'valid'],
  ['valid', 1n],
])(
  'rejects every request when a batch cannot be encoded (%#)',
  async (...inputs) => {
    const t = initTRPC.create();
    const resolver = vi.fn((opts: { input: unknown }) => opts.input);
    const pending = createDeferred<string>();
    const pendingResolver = vi.fn(() => pending.promise);
    const router = t.router({
      echo: t.procedure.input(z.unknown()).query(resolver),
      pending: t.procedure.query(pendingResolver),
    });
    await using ctx = testServerAndClientResource(router, {
      clientLink: 'wsLink',
    });
    const ac = new AbortController();
    const pendingResult = ctx.client.pending.query().then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
    await vi.waitFor(() => expect(pendingResolver).toHaveBeenCalledTimes(1));
    const settled = vi.fn();
    const results = Promise.allSettled(
      inputs.map((input) =>
        ctx.client.echo.query(input, { signal: ac.signal }).finally(settled),
      ),
    );

    try {
      await vi.waitFor(() => expect(settled).toHaveBeenCalledTimes(2));
      expect(await results).toEqual(
        inputs.map(() => ({
          status: 'rejected',
          reason: expect.objectContaining({
            message: expect.stringContaining('BigInt'),
          }),
        })),
      );
      expect(resolver).not.toHaveBeenCalled();
      pending.resolve('pending result');
      expect(await pendingResult).toEqual({ value: 'pending result' });
      expect(await ctx.client.echo.query('after failure')).toBe(
        'after failure',
      );
      expect(resolver).toHaveBeenCalledTimes(1);
      await ctx.wsClient.close();
    } finally {
      ac.abort();
      pending.resolve('pending result');
      await results;
      await pendingResult;
    }
  },
);

test.each([false, true])(
  'rejects a failed batch without sending a stop for an unsent subscription (throwing error observer: %s)',
  async (throwsInObserver) => {
    const uncaught: unknown[] = [];
    const onUncaught = (cause: unknown) => uncaught.push(cause);
    process.on('uncaughtException', onUncaught);
    process.on('unhandledRejection', onUncaught);
    await using ctx = factory();
    await ctx.client.greeting.query();
    const connection = ctx.wsClient.connection;
    assert(connection?.state === 'open');
    const error = new Error('transport send failed');
    const send = vi.spyOn(connection.ws, 'send').mockImplementation(() => {
      throw error;
    });
    const observerError = new Error('Error observer failed');
    const onError = vi.fn();
    const ac = new AbortController();
    const subscription = ctx.client.onMessageObservable.subscribe(undefined, {
      onError(error) {
        onError(error);
        if (throwsInObserver) {
          throw observerError;
        }
      },
    });
    const query = ctx.client.greeting
      .query(undefined, { signal: ac.signal })
      .catch(onError);

    try {
      await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(2));
      expect(send).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls.map((call) => call[0])).toEqual([
        expect.objectContaining({ cause: error }),
        expect.objectContaining({ cause: error }),
      ]);
      await ctx.wsClient.close();
      // `callUserCallback` reports the observer's error asynchronously
      await vi.waitFor(() =>
        expect(uncaught).toEqual(throwsInObserver ? [observerError] : []),
      );
    } finally {
      send.mockRestore();
      subscription.unsubscribe();
      ac.abort();
      await query;
      process.off('uncaughtException', onUncaught);
      process.off('unhandledRejection', onUncaught);
    }
  },
);

test('mutation', async () => {
  await using ctx = factory();
  expect(
    await ctx.client.postEdit.mutate({
      id: 'id',
      data: { title: 'title', text: 'text' },
    }),
  ).toMatchInlineSnapshot(`
    Object {
      "id": "id",
      "text": "text",
      "title": "title",
    }
  `);
});

test('basic subscription test (observable)', async () => {
  await using ctx = factory();
  ctx.ee.once('subscription:created', () => {
    setTimeout(() => {
      ctx.ee.emit('server:msg', {
        id: '1',
      });
      ctx.ee.emit('server:msg', {
        id: '2',
      });
    });
  });
  const onStartedMock = vi.fn();
  const onDataMock = vi.fn();
  const onStateChangeMock = vi.fn();
  const subscription = ctx.client.onMessageObservable.subscribe(undefined, {
    onStarted() {
      onStartedMock();
    },
    onData(data) {
      expectTypeOf(data).not.toBeAny();
      expectTypeOf(data).toMatchTypeOf<Message>();
      onDataMock(data);
    },
    onConnectionStateChange: onStateChangeMock,
  });

  await vi.waitFor(() => {
    expect(onStartedMock).toHaveBeenCalledTimes(1);
    expect(onDataMock).toHaveBeenCalledTimes(2);
  });

  ctx.ee.emit('server:msg', {
    id: '2',
  });
  await vi.waitFor(() => {
    expect(onDataMock).toHaveBeenCalledTimes(3);
  });

  expect(onDataMock.mock.calls.map((c) => c[0])).toEqual([
    { id: '1' },
    { id: '2' },
    { id: '2' },
  ]);

  subscription.unsubscribe();

  await vi.waitFor(() => {
    expect(ctx.ee.listenerCount('server:msg')).toBe(0);
    expect(ctx.ee.listenerCount('server:error')).toBe(0);
  });
  const stateCalls = onStateChangeMock.mock.calls.map((c) => c[0]?.state);
  expect(stateCalls).toContain('connecting');
  expect(stateCalls).toContain('pending');
});

test('subscription is aborted when its signal aborts', async () => {
  await using ctx = factory();

  const ac = new AbortController();
  const onStartedMock = vi.fn<() => void>();

  ctx.client.onMessageObservable.subscribe(undefined, {
    signal: ac.signal,
    onStarted: onStartedMock,
  });

  await vi.waitFor(() => {
    expect(onStartedMock).toHaveBeenCalledTimes(1);
    expect(ctx.ee.listenerCount('server:msg')).toBe(1);
  });

  ac.abort();

  // Aborting the signal must tear the subscription down, sending
  // `subscription.stop` so the server cleans up its listener.
  await vi.waitFor(() => {
    expect(ctx.ee.listenerCount('server:msg')).toBe(0);
  });
});

test('stopping a subscription whose teardown throws does not crash the server', async () => {
  const uncaught: unknown[] = [];
  const onUncaught = (cause: unknown) => uncaught.push(cause);
  process.on('uncaughtException', onUncaught);
  process.on('unhandledRejection', onUncaught);
  try {
    const t = initTRPC.create();
    const teardown = vi.fn(() => {
      throw new Error('teardown');
    });
    const router = t.router({
      greeting: t.procedure.query(() => 'hello'),
      onTick: t.procedure.subscription(() =>
        observable<number>((emit) => {
          emit.next(1);
          return teardown;
        }),
      ),
    });
    await using ctx = testServerAndClientResource(router, {
      client: ({ wsClient }) => ({
        links: [wsLink({ client: wsClient })],
      }),
    });

    const ac = new AbortController();
    const onData = vi.fn();
    const onError = vi.fn();
    const onComplete = vi.fn();
    ctx.client.onTick.subscribe(undefined, {
      signal: ac.signal,
      onData,
      onError,
      onComplete,
    });
    await vi.waitFor(() => {
      expect(onData).toHaveBeenCalledWith(1);
    });

    ac.abort();

    await vi.waitFor(() => {
      expect(teardown).toHaveBeenCalledTimes(1);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    // the connection still works
    expect(await ctx.client.greeting.query()).toBe('hello');

    const raw = new WebSocket(ctx.wssUrl);
    const messages: unknown[] = [];
    raw.addEventListener('message', (msg) => {
      messages.push(JSON.parse(msg.data as string));
    });
    await new Promise((resolve) => raw.once('open', resolve));
    raw.send(
      JSON.stringify({
        id: 1,
        method: 'subscription',
        params: { path: 'onTick', input: undefined },
      }),
    );
    await vi.waitFor(() => {
      expect(messages).toHaveLength(2);
    });
    raw.send(JSON.stringify({ id: 1, method: 'subscription.stop' }));
    await vi.waitFor(() => {
      expect(messages).toHaveLength(3);
    });
    expect(teardown).toHaveBeenCalledTimes(2);
    expect(messages).toEqual([
      { id: 1, result: { type: 'started' } },
      { id: 1, result: { type: 'data', data: 1 } },
      { id: 1, result: { type: 'stopped' } },
    ]);
    raw.close();
  } finally {
    process.off('uncaughtException', onUncaught);
    process.off('unhandledRejection', onUncaught);
  }
  expect(uncaught).toEqual([]);
});

test('subscription observable with error', async () => {
  await using ctx = factory();
  ctx.ee.once('subscription:created', () => {
    setTimeout(() => {
      // two emits to be sure an error is triggered in order
      ctx.ee.emit('server:msg', {
        id: '1',
      });
      ctx.ee.emit('server:msg', {
        id: '2',
      });
      ctx.ee.emit('observable:error', new Error('MyError'));
    });
  });
  const onStartedMock = vi.fn();
  const onDataOrErrorMock = vi.fn();
  const subscription = ctx.client.onMessageObservable.subscribe(undefined, {
    onStarted() {
      onStartedMock();
    },
    onData(data) {
      expectTypeOf(data).not.toBeAny();
      expectTypeOf(data).toMatchTypeOf<Message>();
      onDataOrErrorMock({ data });
    },
    onError(error) {
      onDataOrErrorMock({ error });
    },
  });

  await vi.waitFor(() => {
    expect(onStartedMock).toHaveBeenCalledTimes(1);
    expect(onDataOrErrorMock).toHaveBeenCalledTimes(3);
  });

  expect(onDataOrErrorMock.mock.calls).toMatchInlineSnapshot(`
    Array [
      Array [
        Object {
          "data": Object {
            "id": "1",
          },
        },
      ],
      Array [
        Object {
          "data": Object {
            "id": "2",
          },
        },
      ],
      Array [
        Object {
          "error": [TRPCClientError: MyError],
        },
      ],
    ]
  `);

  subscription.unsubscribe();

  await vi.waitFor(() => {
    expect(ctx.ee.listenerCount('server:msg')).toBe(0);
    expect(ctx.ee.listenerCount('server:error')).toBe(0);
  });
});

test('basic subscription test (iterator)', async () => {
  await using ctx = factory();
  ctx.ee.once('subscription:created', () => {
    setTimeout(() => {
      ctx.ee.emit('server:msg', {
        id: '1',
      });
      ctx.ee.emit('server:msg', {
        id: '2',
      });
    });
  });
  const onStartedMock = vi.fn();
  const onDataMock = vi.fn();
  const subscription = ctx.client.onMessageIterable.subscribe(undefined, {
    onStarted() {
      onStartedMock();
    },
    onData(data) {
      expectTypeOf(data).not.toBeAny();
      expectTypeOf(data).toMatchTypeOf<Message>();
      onDataMock(data);
    },
  });

  await vi.waitFor(() => {
    expect(onStartedMock).toHaveBeenCalledTimes(1);
    expect(onDataMock).toHaveBeenCalledTimes(2);
  });

  ctx.ee.emit('server:msg', {
    id: '2',
  });
  await vi.waitFor(() => {
    expect(onDataMock).toHaveBeenCalledTimes(3);
  });

  expect(onDataMock.mock.calls).toMatchInlineSnapshot(`
    Array [
      Array [
        Object {
          "id": "1",
        },
      ],
      Array [
        Object {
          "id": "2",
        },
      ],
      Array [
        Object {
          "id": "2",
        },
      ],
    ]
  `);

  subscription.unsubscribe();

  await vi.waitFor(() => {
    expect(ctx.ee.listenerCount('data')).toBe(0);
  });

  await vi.waitFor(() => {
    expect(ctx.ee.listenerCount('server:msg')).toBe(0);
    expect(ctx.ee.listenerCount('server:error')).toBe(0);
  });
});

test('subscribe() - async iterable', async () => {
  await using ctx = factory();
  ctx.ee.once('subscription:created', () => {
    setTimeout(() => {
      ctx.ee.emit('server:msg', {
        id: '1',
      });
      ctx.ee.emit('server:msg', {
        id: '2',
      });
    });
  });

  const aggregate: Message[] = [];
  for await (const value of ctx.client.onMessageIterable.subscribe(undefined)) {
    expectTypeOf(value).not.toBeAny();
    expectTypeOf(value).toMatchTypeOf<Message>();
    aggregate.push(value);
    if (aggregate.length === 2) {
      break;
    }
  }

  expect(aggregate).toEqual([{ id: '1' }, { id: '2' }]);

  await vi.waitFor(() => {
    expect(ctx.ee.listenerCount('server:msg')).toBe(0);
  });
});

test('subscribe() - async iterable rejects on error', async () => {
  await using ctx = factory();
  ctx.ee.once('subscription:created', () => {
    setTimeout(() => {
      ctx.ee.emit('server:msg', {
        id: '1',
      });
      ctx.ee.emit('observable:error', new Error('MyError'));
    });
  });

  const aggregate: Message[] = [];
  await expect(async () => {
    for await (const value of ctx.client.onMessageObservable.subscribe(
      undefined,
    )) {
      expectTypeOf(value).not.toBeAny();
      expectTypeOf(value).toMatchTypeOf<Message>();
      aggregate.push(value);
    }
  }).rejects.toThrowError('MyError');

  expect(aggregate).toEqual([{ id: '1' }]);

  // the subscription is torn down after the error
  await vi.waitFor(() => {
    expect(ctx.ee.listenerCount('server:msg')).toBe(0);
  });
});

test('subscribe() - abort signal ends async iteration', async () => {
  await using ctx = factory();

  const ac = new AbortController();
  const aggregate: Message[] = [];
  const done = (async () => {
    for await (const value of ctx.client.onMessageIterable.subscribe(
      undefined,
      { signal: ac.signal },
    )) {
      aggregate.push(value);
    }
  })();

  await vi.waitFor(() => {
    expect(ctx.ee.listenerCount('server:msg')).toBe(1);
  });

  ctx.ee.emit('server:msg', {
    id: '1',
  });

  await vi.waitFor(() => {
    expect(aggregate).toEqual([{ id: '1' }]);
  });

  ac.abort();

  // aborting ends the iteration instead of leaving it hanging
  await done;

  await vi.waitFor(() => {
    expect(ctx.ee.listenerCount('server:msg')).toBe(0);
  });
});

test('$subscription() - client resumes subscriptions after reconnecting', async () => {
  await using ctx = factory();
  ctx.ee.once('subscription:created', () => {
    setTimeout(() => {
      ctx.ee.emit('server:msg', {
        id: '1',
      });
      ctx.ee.emit('server:msg', {
        id: '2',
      });
    });
  });
  const onStartedMock = vi.fn();
  const onDataMock = vi.fn();
  const onErrorMock = vi.fn();
  const onCompleteMock = vi.fn();
  ctx.client.onMessageObservable.subscribe(undefined, {
    onStarted: onStartedMock,
    onData: onDataMock,
    onError: onErrorMock,
    onComplete: onCompleteMock,
  });

  await vi.waitFor(() => {
    expect(onStartedMock).toHaveBeenCalledTimes(1);
    expect(onDataMock).toHaveBeenCalledTimes(2);
  });

  // kill all connections to the server (simulates restart)
  ctx.destroyConnections();

  // start a new wss server on same port, and trigger a message
  onStartedMock.mockClear();
  onDataMock.mockClear();
  onCompleteMock.mockClear();

  ctx.ee.once('subscription:created', () => {
    setTimeout(() => {
      ctx.ee.emit('server:msg', {
        id: '3',
      });
    }, 1);
  });

  await vi.waitFor(() => {
    expect(onDataMock).toHaveBeenCalledTimes(1);
  });
  expect(onDataMock.mock.calls.map((args) => args[0])).toMatchInlineSnapshot(`
    Array [
      Object {
        "id": "3",
      },
    ]
  `);
});

test('server subscription ended', async () => {
  await using ctx = factory();
  ctx.ee.once('subscription:created', () => {
    setTimeout(() => {
      ctx.ee.emit('server:msg', {
        id: '1',
      });
      ctx.ee.emit('server:msg', {
        id: '2',
      });
    });
  });
  const onStartedMock = vi.fn();
  const onDataMock = vi.fn();
  const onErrorMock = vi.fn();
  const onCompleteMock = vi.fn();
  ctx.client.onMessageObservable.subscribe(undefined, {
    onStarted: onStartedMock,
    onData: onDataMock,
    onError: onErrorMock,
    onComplete: onCompleteMock,
  });

  await vi.waitFor(() => {
    expect(onStartedMock).toHaveBeenCalledTimes(1);
    expect(onDataMock).toHaveBeenCalledTimes(2);
  });
  // destroy server subscription (called by server)
  ctx.subRef.current.complete();
  await vi.waitFor(() => {
    expect(onCompleteMock).toHaveBeenCalledTimes(1);
  });
});

test('can close wsClient when subscribed', async () => {
  await using ctx = factory();
  const serversideWsOnCloseMock = vi.fn();
  ctx.wss.addListener('connection', (ws) =>
    ws.on('close', serversideWsOnCloseMock),
  );

  const onStartedMock = vi.fn();
  const onDataMock = vi.fn();
  const onErrorMock = vi.fn();
  const onCompleteMock = vi.fn();
  ctx.client.onMessageObservable.subscribe(undefined, {
    onStarted: onStartedMock,
    onData: onDataMock,
    onError: onErrorMock,
    onComplete: onCompleteMock,
  });

  await vi.waitFor(() => {
    expect(onStartedMock).toHaveBeenCalledTimes(1);
  });

  ctx.wsClient.close();

  await vi.waitFor(() => {
    expect(onCompleteMock).toHaveBeenCalledTimes(1);
    expect(ctx.onCloseMock).toHaveBeenCalledTimes(1);
    expect(serversideWsOnCloseMock).toHaveBeenCalledTimes(1);
  });
});

test('sub emits errors', async () => {
  await using ctx = factory();

  ctx.ee.once('subscription:created', () => {
    setTimeout(() => {
      ctx.ee.emit('server:msg', {
        id: '1',
      });
      ctx.subRef.current.error(new Error('test'));
    });
  });
  const onStartedMock = vi.fn();
  const onDataMock = vi.fn();
  const onErrorMock = vi.fn();
  const onCompleteMock = vi.fn();
  ctx.client.onMessageObservable.subscribe(undefined, {
    onStarted: onStartedMock,
    onData: onDataMock,
    onError: onErrorMock,
    onComplete: onCompleteMock,
  });

  await vi.waitFor(() => {
    expect(onStartedMock).toHaveBeenCalledTimes(1);
    expect(onDataMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock).toHaveBeenCalledTimes(1);
    expect(onCompleteMock).toHaveBeenCalledTimes(0);
  });
});

test('wait for slow queries/mutations before disconnecting', async () => {
  await using ctx = factory();

  await vi.waitFor(() => {
    expect(ctx.wsClient.connection?.state === 'open').toBe(true);
  });
  const promise = ctx.client.mut.mutate();
  await vi.waitFor(() => {
    expect(ctx.onSlowMutationCalled).toHaveBeenCalledTimes(1);
  });
  const conn = ctx.wsClient.connection!;
  ctx.wsClient.close();
  expect(await promise).toMatchInlineSnapshot(`"mutation resolved"`);

  await vi.waitFor(() => {
    expect(conn.ws.readyState).toBe(WebSocket.CLOSED);
  });
});

test('requests get aborted if called before connection is established and requests dispatched', async () => {
  await using ctx = factory();

  await vi.waitFor(() => {
    expect(ctx.wsClient.connection?.state === 'open').toBe(true);
  });
  const promise = ctx.client.mut.mutate();
  const conn = ctx.wsClient.connection;
  ctx.wsClient.close();
  await expect(promise).rejects.toMatchInlineSnapshot(
    '[TRPCClientError: Closed before connection was established]',
  );
  await vi.waitFor(() => {
    expect(conn!.ws.readyState).toBe(WebSocket.CLOSED);
  });
});

test('subscriptions are automatically resumed upon explicit reconnect request', async () => {
  await using ctx = factory();
  ctx.ee.once('subscription:created', () => {
    setTimeout(() => {
      ctx.ee.emit('server:msg', {
        id: '1',
      });
    });
  });
  function createSub() {
    const onStartedMock = vi.fn();
    const onDataMock = vi.fn();
    const onErrorMock = vi.fn();
    const onStoppedMock = vi.fn();
    const onCompleteMock = vi.fn();
    const unsub = ctx.client.onMessageObservable.subscribe(undefined, {
      onStarted: onStartedMock,
      onData: onDataMock,
      onError: onErrorMock,
      onStopped: onStoppedMock,
      onComplete: onCompleteMock,
    });
    return {
      onStartedMock,
      onDataMock,
      onErrorMock,
      onStoppedMock,
      onCompleteMock,
      unsub,
    };
  }
  const sub1 = createSub();

  await vi.waitFor(() => {
    expect(sub1.onStartedMock).toHaveBeenCalledTimes(1);
    expect(sub1.onDataMock).toHaveBeenCalledTimes(1);
    expect(ctx.onOpenMock).toHaveBeenCalledTimes(1);
    expect(ctx.onCloseMock).toHaveBeenCalledTimes(0);
  });
  ctx.wssHandler.broadcastReconnectNotification();
  await vi.waitFor(() => {
    expect(ctx.wss.clients.size).toBe(1);
    expect(ctx.onOpenMock).toHaveBeenCalledTimes(2);
    expect(ctx.onCloseMock).toHaveBeenCalledTimes(1);
  });

  await vi.waitFor(() => {
    expect(sub1.onStartedMock).toHaveBeenCalledTimes(1);
    expect(sub1.onDataMock).toHaveBeenCalledTimes(1);
  });
  ctx.ee.emit('server:msg', {
    id: '2',
  });

  await vi.waitFor(() => {
    expect(sub1.onDataMock).toHaveBeenCalledTimes(2);
  });
  expect(sub1.onDataMock.mock.calls.map((args) => args[0]))
    .toMatchInlineSnapshot(`
    Array [
      Object {
        "id": "1",
      },
      Object {
        "id": "2",
      },
    ]
  `);
  await vi.waitFor(() => {
    expect(ctx.wss.clients.size).toBe(1);
  });

  // Note: With await using, the second close event might not be captured
  // as the test context is cleaned up automatically
  expect(ctx.onCloseMock).toHaveBeenCalledTimes(1);
});

test.each(['close', 'error'] as const)(
  'a retired connection %s event does not fail queries on its replacement',
  async (event) => {
    const t = initTRPC.create();
    const pendingResult = createDeferred<string>();
    const queryStarted = vi.fn();
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const onError = vi.fn();
    const router = t.router({
      greeting: t.procedure.query(() => 'hello'),
      pending: t.procedure.query(() => {
        queryStarted();
        return pendingResult.promise;
      }),
    });
    await using ctx = testServerAndClientResource(router, {
      clientLink: 'wsLink',
      wsClient: {
        lazy: { enabled: false, closeMs: 0 },
        retryDelayMs: () => 0,
        onOpen,
        onClose,
        onError,
      },
    });
    const abortController = new AbortController();
    let oldServerSocket: WebSocket | undefined;

    try {
      expect(await ctx.client.greeting.query()).toBe('hello');
      const oldClientSocket = ctx.wsClient.connection!.ws;
      oldServerSocket = [...ctx.wss.clients][0]!;
      // Delay the old connection's closing handshake until its replacement is open.
      oldServerSocket.pause();
      ctx.wssHandler.broadcastReconnectNotification();
      await vi.waitFor(() => {
        expect(onOpen).toHaveBeenCalledTimes(2);
      });
      const replacementSocket = ctx.wsClient.connection!.ws;
      expect(replacementSocket).not.toBe(oldClientSocket);
      expect(oldClientSocket.readyState).toBe(WebSocket.CLOSING);

      const result = ctx.client.pending
        .query(undefined, { signal: abortController.signal })
        .catch((error) => error);
      await vi.waitFor(() => {
        expect(queryStarted).toHaveBeenCalledTimes(1);
      });
      if (event === 'error') {
        // A masked server frame triggers a protocol error on the retired socket.
        oldServerSocket.send('invalid frame', { mask: true });
      }
      oldServerSocket.resume();
      await vi.waitFor(() => {
        expect(oldClientSocket.readyState).toBe(WebSocket.CLOSED);
      });
      pendingResult.resolve('replacement query completed');

      expect(await result).toBe('replacement query completed');
      expect(await ctx.client.greeting.query()).toBe('hello');
      expect(ctx.wsClient.connection!.ws).toBe(replacementSocket);
      expect(onOpen).toHaveBeenCalledTimes(2);
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledTimes(event === 'error' ? 1 : 0);
    } finally {
      oldServerSocket?.resume();
      pendingResult.resolve('cleanup');
      abortController.abort();
      await ctx.wsClient.close();
    }
  },
);

describe('a socket the server closes while a new request opens its replacement', () => {
  function setup() {
    const t = initTRPC.create();
    const pendingResult = createDeferred<string>();
    const queryStarted = vi.fn();
    const subscriptionStarted = vi.fn();
    const router = t.router({
      greeting: t.procedure.query(() => 'hello'),
      pending: t.procedure.query(() => {
        queryStarted();
        return pendingResult.promise;
      }),
      onStart: t.procedure.subscription(() =>
        observable<number>((emit) => {
          subscriptionStarted();
          emit.next(subscriptionStarted.mock.calls.length);
        }),
      ),
    });
    const ctx = testServerAndClientResource(router, {
      clientLink: 'wsLink',
      wsClient: {
        lazy: { enabled: false, closeMs: 0 },
        retryDelayMs: () => 0,
      },
    });

    /**
     * Closes the connection from the server and holds it in CLOSING while a
     * new query opens its replacement, then lets it finish closing.
     */
    async function closeDuringNewQuery() {
      const oldClientSocket = ctx.wsClient.connection!.ws;
      const oldServerSocket = [...ctx.wss.clients][0]!;
      oldServerSocket.close();
      oldServerSocket.pause();
      try {
        await vi.waitFor(() => {
          expect(oldClientSocket.readyState).toBe(WebSocket.CLOSING);
        });
        expect(await ctx.client.greeting.query()).toBe('hello');
        expect(ctx.wsClient.connection!.ws).not.toBe(oldClientSocket);
      } finally {
        oldServerSocket.resume();
      }
      await vi.waitFor(() => {
        expect(oldClientSocket.readyState).toBe(WebSocket.CLOSED);
      });
    }

    return {
      ctx,
      pendingResult,
      queryStarted,
      subscriptionStarted,
      closeDuringNewQuery,
    };
  }

  test('a query pending on it fails', async () => {
    const { ctx, pendingResult, queryStarted, closeDuringNewQuery } = setup();
    await using _ctx = ctx;
    const abortController = new AbortController();
    try {
      const settled = vi.fn();
      const result = ctx.client.pending
        .query(undefined, { signal: abortController.signal })
        .then(settled, (error) => {
          settled(error);
        });
      await vi.waitFor(() => {
        expect(queryStarted).toHaveBeenCalledTimes(1);
      });

      await closeDuringNewQuery();

      await vi.waitFor(() => {
        expect(settled).toHaveBeenCalledTimes(1);
      });
      await result;
      expect(settled.mock.calls[0]![0]).toMatchObject({
        name: 'TRPCClientError',
      });
      expect(await ctx.client.greeting.query()).toBe('hello');
    } finally {
      abortController.abort();
      pendingResult.resolve('cleanup');
      await ctx.wsClient.close();
    }
  });

  test('a query pending on its replacement completes', async () => {
    const { ctx, pendingResult, queryStarted } = setup();
    await using _ctx = ctx;
    expect(await ctx.client.greeting.query()).toBe('hello');
    const oldClientSocket = ctx.wsClient.connection!.ws;
    const oldServerSocket = [...ctx.wss.clients][0]!;
    try {
      oldServerSocket.close();
      oldServerSocket.pause();
      await vi.waitFor(() => {
        expect(oldClientSocket.readyState).toBe(WebSocket.CLOSING);
      });

      const result = ctx.client.pending.query().catch((error) => error);
      await vi.waitFor(() => {
        expect(queryStarted).toHaveBeenCalledTimes(1);
      });
      const replacementSocket = ctx.wsClient.connection!.ws;
      expect(replacementSocket).not.toBe(oldClientSocket);

      oldServerSocket.resume();
      await vi.waitFor(() => {
        expect(oldClientSocket.readyState).toBe(WebSocket.CLOSED);
      });
      pendingResult.resolve('replacement query completed');

      expect(await result).toBe('replacement query completed');
      expect(await ctx.client.greeting.query()).toBe('hello');
      expect(ctx.wsClient.connection!.ws).toBe(replacementSocket);
    } finally {
      oldServerSocket.resume();
      pendingResult.resolve('cleanup');
      await ctx.wsClient.close();
    }
  });

  test('a subscription on it resumes', async () => {
    const { ctx, subscriptionStarted, closeDuringNewQuery } = setup();
    await using _ctx = ctx;
    const onData = vi.fn();
    const subscription = ctx.client.onStart.subscribe(undefined, { onData });
    try {
      await vi.waitFor(() => {
        expect(onData).toHaveBeenCalledTimes(1);
      });

      await closeDuringNewQuery();

      await vi.waitFor(() => {
        expect(subscriptionStarted).toHaveBeenCalledTimes(2);
        expect(onData).toHaveBeenCalledTimes(2);
      });
      expect(onData).toHaveBeenLastCalledWith(2);
    } finally {
      subscription.unsubscribe();
      await ctx.wsClient.close();
    }
  });
});

describe('requests pending on a socket that a server reconnect retires', () => {
  test('a mutation in flight is not executed a second time on the replacement', async () => {
    const t = initTRPC.create();
    const release = createDeferred<void>();
    const executions = vi.fn();
    const onOpen = vi.fn();
    const router = t.router({
      greeting: t.procedure.query(() => 'hello'),
      charge: t.procedure.mutation(async () => {
        executions();
        await release.promise;
        return 'charged';
      }),
    });
    await using ctx = testServerAndClientResource(router, {
      clientLink: 'wsLink',
      wsClient: {
        lazy: { enabled: false, closeMs: 0 },
        retryDelayMs: () => 0,
        onOpen,
      },
    });
    const oldServerSockets: WebSocket[] = [];
    try {
      await vi.waitFor(() => {
        expect(onOpen).toHaveBeenCalledTimes(1);
      });
      const oldClientSocket = ctx.wsClient.connection!.ws;
      const oldResults: unknown[] = [];
      oldClientSocket.addEventListener('message', ({ data }) => {
        const text =
          typeof data === 'string' ? data : String(Buffer.from(data));
        if (text === 'PING' || text === 'PONG') return;
        const message = JSON.parse(text);
        if ('result' in message) oldResults.push(message.result.data);
      });
      const result = ctx.client.charge.mutate().catch((error) => error);
      await vi.waitFor(() => {
        expect(executions).toHaveBeenCalledTimes(1);
      });

      // The old server socket is slow to answer the closing handshake.
      const oldServerSocket = [...ctx.wss.clients][0]!;
      oldServerSockets.push(oldServerSocket);
      oldServerSocket.pause();
      ctx.wssHandler.broadcastReconnectNotification();
      await vi.waitFor(() => {
        expect(onOpen).toHaveBeenCalledTimes(2);
      });
      expect(await ctx.client.greeting.query()).toBe('hello');
      expect(executions).toHaveBeenCalledTimes(1);

      oldServerSocket.resume();
      release.resolve();
      expect(await result).toBe('charged');
      expect(oldResults).toEqual(['charged']);
      expect(executions).toHaveBeenCalledTimes(1);
    } finally {
      release.resolve();
      for (const socket of oldServerSockets) socket.resume();
      await ctx.wsClient.close();
    }
  });

  test("a retired socket's connection-level frames are ignored", async () => {
    const t = initTRPC.create();
    const onOpen = vi.fn();
    const attempts: number[] = [];
    const router = t.router({
      greeting: t.procedure.query(() => 'hello'),
    });
    await using ctx = testServerAndClientResource(router, {
      clientLink: 'wsLink',
      wsClient: {
        lazy: { enabled: false, closeMs: 0 },
        retryDelayMs: (attemptIndex) => {
          attempts.push(attemptIndex);
          return 0;
        },
        onOpen,
      },
    });
    const oldServerSockets: WebSocket[] = [];
    try {
      await vi.waitFor(() => {
        expect(ctx.wsClient.connection?.state).toBe('open');
      });
      const oldClientSocket = ctx.wsClient.connection!.ws;
      // Holds the old socket in its closing handshake.
      const oldServerSocket = [...ctx.wss.clients][0]!;
      oldServerSockets.push(oldServerSocket);
      oldServerSocket.pause();
      ctx.wssHandler.broadcastReconnectNotification();
      await vi.waitFor(() => {
        expect(ctx.wsClient.connection?.state).toBe('open');
        expect(ctx.wsClient.connection!.ws).not.toBe(oldClientSocket);
      });
      const oldFrames: unknown[] = [];
      oldClientSocket.addEventListener('message', ({ data }) => {
        oldFrames.push(data);
      });

      oldServerSocket.send(
        JSON.stringify({
          id: null,
          error: {
            message: 'late',
            code: -32600,
            data: { code: 'BAD_REQUEST', httpStatus: 400 },
          },
        }),
      );
      oldServerSocket.send(JSON.stringify({ id: null, method: 'reconnect' }));
      await vi.waitFor(() => {
        expect(oldFrames).toHaveLength(2);
      });
      oldServerSocket.resume();
      await vi.waitFor(() => {
        expect(oldClientSocket.readyState).toBe(WebSocket.CLOSED);
        expect(ctx.wss.clients.size).toBe(1);
      });

      // Dropping the replacement starts over at the first attempt.
      [...ctx.wss.clients][0]!.terminate();
      await vi.waitFor(() => {
        expect(onOpen.mock.calls.length).toBeGreaterThanOrEqual(3);
      });
      expect(await ctx.client.greeting.query()).toBe('hello');
      expect(attempts).toEqual([0, 0]);
      expect(onOpen).toHaveBeenCalledTimes(3);
    } finally {
      for (const socket of oldServerSockets) socket.resume();
      await ctx.wsClient.close();
    }
  });

  test('a link that throws on a failed query does not delay the reconnect', async () => {
    const t = initTRPC.create();
    const pendingResult = createDeferred<string>();
    const queryStarted = vi.fn();
    const subscriptionStarted = vi.fn();
    const router = t.router({
      pending: t.procedure.query(() => {
        queryStarted();
        return pendingResult.promise;
      }),
      onStart: t.procedure.subscription(() =>
        observable<number>((emit) => {
          subscriptionStarted();
          emit.next(subscriptionStarted.mock.calls.length);
        }),
      ),
    });
    const linkError = new Error('link error callback failed');
    await using ctx = testServerAndClientResource(router, {
      wsClient: {
        lazy: { enabled: false, closeMs: 0 },
      },
      client: ({ wsClient }) => ({
        links: [
          () =>
            ({ op, next }) =>
              next(op).pipe(
                tap({
                  error() {
                    if (op.path === 'pending') throw linkError;
                  },
                }),
              ),
          wsLink({ client: wsClient }),
        ],
      }),
    });
    const uncaught: unknown[] = [];
    const onUncaught = (cause: unknown) => uncaught.push(cause);
    process.on('uncaughtException', onUncaught);
    const onData = vi.fn();
    const subscription = ctx.client.onStart.subscribe(undefined, { onData });
    const abortController = new AbortController();
    void ctx.client.pending
      .query(undefined, { signal: abortController.signal })
      .catch(() => null);
    try {
      await vi.waitFor(() => {
        expect(onData).toHaveBeenCalledTimes(1);
        expect(queryStarted).toHaveBeenCalledTimes(1);
      });

      [...ctx.wss.clients][0]!.close();

      // The default backoff waits 2s after a failed attempt.
      await vi.waitFor(
        () => {
          expect(onData).toHaveBeenCalledTimes(2);
        },
        { timeout: 500 },
      );
      // `callUserCallback` reports the link's error asynchronously
      await vi.waitFor(() => {
        expect(uncaught).toEqual([linkError]);
      });
    } finally {
      process.off('uncaughtException', onUncaught);
      subscription.unsubscribe();
      abortController.abort();
      pendingResult.resolve('cleanup');
      await ctx.wsClient.close();
    }
  });

  describe('while connectionParams throw', () => {
    function setup() {
      const t = initTRPC.create();
      const pendingResult = createDeferred<string>();
      const queryStarted = vi.fn();
      const onOpen = vi.fn();
      let failConnectionParams = false;
      const router = t.router({
        pending: t.procedure.query(() => {
          queryStarted();
          return pendingResult.promise;
        }),
      });
      const ctx = testServerAndClientResource(router, {
        clientLink: 'wsLink',
        wsClient: {
          lazy: { enabled: false, closeMs: 0 },
          retryDelayMs: () => 20,
          onOpen,
          connectionParams: () => {
            if (failConnectionParams) throw new Error('token unavailable');
            return { token: 'ok' };
          },
        },
      });

      /**
       * Starts a query, then has the server request a reconnect while every
       * replacement opens and then fails sending its connectionParams.
       */
      async function reconnectWithFailingConnectionParams() {
        const settled = vi.fn();
        const abortController = new AbortController();
        const result = ctx.client.pending
          .query(undefined, { signal: abortController.signal })
          .then(settled, (error) => {
            settled(error);
          });
        await vi.waitFor(() => {
          expect(queryStarted).toHaveBeenCalledTimes(1);
        });
        const oldClientSocket = ctx.wsClient.connection!.ws;

        failConnectionParams = true;
        ctx.wssHandler.broadcastReconnectNotification();
        await vi.waitFor(() => {
          expect(onOpen.mock.calls.length).toBeGreaterThanOrEqual(3);
        });
        return { oldClientSocket, settled, result, abortController };
      }

      return { ctx, pendingResult, reconnectWithFailingConnectionParams };
    }

    test('a query pending on the retired socket resolves from it', async () => {
      const { ctx, pendingResult, reconnectWithFailingConnectionParams } =
        setup();
      await using _ctx = ctx;
      const { oldClientSocket, settled, result, abortController } =
        await reconnectWithFailingConnectionParams();
      try {
        expect(settled).not.toHaveBeenCalled();
        pendingResult.resolve('resolved');
        await result;
        expect(settled).toHaveBeenCalledExactlyOnceWith('resolved');
        // Until a replacement opens, the old socket stays open.
        await sleep(100);
        expect(oldClientSocket.readyState).toBe(WebSocket.OPEN);
      } finally {
        abortController.abort();
        pendingResult.resolve('cleanup');
        await ctx.wsClient.close();
      }
    });

    test('wsClient.close() resolves', async () => {
      const { ctx, pendingResult, reconnectWithFailingConnectionParams } =
        setup();
      await using _ctx = ctx;
      const { settled, result, abortController } =
        await reconnectWithFailingConnectionParams();
      try {
        const closed = vi.fn();
        void ctx.wsClient.close().then(closed);
        // `close()` waits for the query.
        pendingResult.resolve('resolved');
        await vi.waitFor(() => {
          expect(closed).toHaveBeenCalledTimes(1);
        });
        await result;
        expect(settled).toHaveBeenCalledExactlyOnceWith('resolved');
      } finally {
        abortController.abort();
        pendingResult.resolve('cleanup');
        await ctx.wsClient.close();
      }
    });
  });
});

describe('a server-requested reconnect drains the old socket', () => {
  function setup() {
    const t = initTRPC.create();
    const slowResult = createDeferred<string>();
    const pendingResult = createDeferred<string>();
    const release = createDeferred<void>();
    const slowStarted = vi.fn();
    const pendingStarted = vi.fn();
    const charged = vi.fn();
    const subscriptionStarted = vi.fn();
    const subscriptionEnded = vi.fn();
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const onError = vi.fn();
    const ee = new EventEmitter();
    let failConnectionParams = false;
    const router = t.router({
      greeting: t.procedure.query(() => 'hello'),
      slow: t.procedure.query(() => {
        slowStarted();
        return slowResult.promise;
      }),
      pending: t.procedure.query(() => {
        pendingStarted();
        return pendingResult.promise;
      }),
      charge: t.procedure.mutation(async () => {
        charged();
        await release.promise;
        return 'charged';
      }),
      onStart: t.procedure.subscription(() =>
        observable<number>((emit) => {
          subscriptionStarted();
          emit.next(subscriptionStarted.mock.calls.length);
          const onData = (value: number) => emit.next(value);
          ee.on('data', onData);
          return () => {
            subscriptionEnded();
            ee.off('data', onData);
          };
        }),
      ),
    });
    const ctx = testServerAndClientResource(router, {
      clientLink: 'wsLink',
      wsClient: {
        lazy: { enabled: false, closeMs: 0 },
        retryDelayMs: () => 20,
        onOpen,
        onClose,
        onError,
        connectionParams: () => {
          if (failConnectionParams) throw new Error('token unavailable');
          return { token: 'ok' };
        },
      },
    });

    /** The requests the server received, with the socket each came on. */
    const received: { socket: WebSocket; id: unknown; path: unknown }[] = [];
    ctx.wss.on('connection', (socket) => {
      socket.on('message', (data) => {
        // oxlint-disable-next-line typescript/no-base-to-string
        const text = data.toString();
        if (text === 'PING' || text === 'PONG') return;
        for (const message of [JSON.parse(text)].flat()) {
          if (message.method === 'connectionParams') continue;
          received.push({ socket, id: message.id, path: message.params?.path });
        }
      });
    });
    const receivedFor = (path: string) =>
      received.filter((request) => request.path === path);

    /** Records the ids of the responses `ws` receives. */
    function responseIds(ws: globalThis.WebSocket) {
      const ids: unknown[] = [];
      ws.addEventListener('message', ({ data }) => {
        const text =
          typeof data === 'string' ? data : String(Buffer.from(data));
        if (text === 'PING' || text === 'PONG') return;
        const message = JSON.parse(text);
        if ('result' in message || 'error' in message) ids.push(message.id);
      });
      return ids;
    }

    /**
     * Starts `slow`, then has the server request a reconnect once it's in
     * flight, and waits for the replacement to open.
     */
    async function reconnectDuringSlowQuery() {
      await vi.waitFor(() => {
        expect(onOpen).toHaveBeenCalledTimes(1);
      });
      const oldClientSocket = ctx.wsClient.connection!.ws;
      const oldResponses = responseIds(oldClientSocket);
      const slow = ctx.client.slow.query().catch((error) => error);
      await vi.waitFor(() => {
        expect(slowStarted).toHaveBeenCalledTimes(1);
      });
      const oldServerSocket = receivedFor('slow')[0]!.socket;

      ctx.wssHandler.broadcastReconnectNotification();
      await vi.waitFor(() => {
        expect(onOpen).toHaveBeenCalledTimes(2);
        expect(ctx.wsClient.connection?.state).toBe('open');
        expect(ctx.wsClient.connection!.ws).not.toBe(oldClientSocket);
      });
      const replacementSocket = ctx.wsClient.connection!.ws;
      expect(oldClientSocket.readyState).toBe(WebSocket.OPEN);

      return {
        slow,
        oldClientSocket,
        oldServerSocket,
        oldResponses,
        replacementSocket,
        replacementResponses: responseIds(replacementSocket),
      };
    }

    function cleanup() {
      slowResult.resolve('cleanup');
      pendingResult.resolve('cleanup');
      release.resolve();
      return ctx.wsClient.close();
    }

    return {
      ctx,
      ee,
      slowResult,
      pendingResult,
      release,
      slowStarted,
      pendingStarted,
      charged,
      subscriptionStarted,
      subscriptionEnded,
      onOpen,
      onClose,
      onError,
      failConnectionParams: () => {
        failConnectionParams = true;
      },
      receivedFor,
      reconnectDuringSlowQuery,
      cleanup,
    };
  }

  test('a query in flight resolves once from the old socket', async () => {
    const {
      ctx,
      slowResult,
      slowStarted,
      receivedFor,
      reconnectDuringSlowQuery,
      cleanup,
    } = setup();
    await using _ctx = ctx;
    try {
      const { slow, oldServerSocket, oldResponses, replacementResponses } =
        await reconnectDuringSlowQuery();

      // New requests go to the replacement.
      expect(await ctx.client.greeting.query()).toBe('hello');
      expect(receivedFor('greeting')[0]!.socket).not.toBe(oldServerSocket);

      slowResult.resolve('slow');
      expect(await slow).toBe('slow');
      expect(slowStarted).toHaveBeenCalledTimes(1);
      const [request, ...resent] = receivedFor('slow');
      expect(resent).toEqual([]);
      expect(oldResponses).toEqual([request!.id]);
      expect(replacementResponses).not.toContain(request!.id);
    } finally {
      await cleanup();
    }
  });

  test('a mutation in flight resolves once and runs once', async () => {
    const { ctx, release, charged, onOpen, receivedFor, cleanup } = setup();
    await using _ctx = ctx;
    try {
      await vi.waitFor(() => {
        expect(onOpen).toHaveBeenCalledTimes(1);
      });
      const result = ctx.client.charge.mutate().catch((error) => error);
      await vi.waitFor(() => {
        expect(charged).toHaveBeenCalledTimes(1);
      });

      ctx.wssHandler.broadcastReconnectNotification();
      await vi.waitFor(() => {
        expect(onOpen).toHaveBeenCalledTimes(2);
        expect(ctx.wsClient.connection?.state).toBe('open');
      });
      // Anything resent on the replacement reaches the server before this.
      expect(await ctx.client.greeting.query()).toBe('hello');

      release.resolve();
      expect(await result).toBe('charged');
      expect(charged).toHaveBeenCalledTimes(1);
      expect(receivedFor('charge')).toHaveLength(1);
    } finally {
      await cleanup();
    }
  });

  test.each(['close', 'error'] as const)(
    'the old socket closes once drained, and its late %s event leaves the replacement alone',
    async (event) => {
      const {
        ctx,
        ee,
        slowResult,
        pendingResult,
        pendingStarted,
        subscriptionStarted,
        subscriptionEnded,
        onOpen,
        onClose,
        onError,
        reconnectDuringSlowQuery,
        cleanup,
      } = setup();
      await using _ctx = ctx;
      const onData = vi.fn();
      const subscription = ctx.client.onStart.subscribe(undefined, {
        onData,
      });
      let oldServerSocket: WebSocket | undefined;
      try {
        await vi.waitFor(() => {
          expect(onData).toHaveBeenCalledTimes(1);
        });
        const reconnected = await reconnectDuringSlowQuery();
        const { oldClientSocket, oldResponses, replacementSocket } =
          reconnected;
        oldServerSocket = reconnected.oldServerSocket;
        // The subscription moves to the replacement and is stopped on the
        // old socket, whose `stopped` reply is ignored.
        await vi.waitFor(() => {
          expect(onData).toHaveBeenCalledTimes(2);
          expect(subscriptionEnded).toHaveBeenCalledTimes(1);
          expect(oldResponses).toHaveLength(1);
        });
        expect(oldClientSocket.readyState).toBe(WebSocket.OPEN);
        ee.emit('data', 100);
        await vi.waitFor(() => {
          expect(onData).toHaveBeenCalledTimes(3);
        });

        // Delay the old socket's closing handshake.
        oldServerSocket.pause();
        slowResult.resolve('slow');
        expect(await reconnected.slow).toBe('slow');
        await vi.waitFor(() => {
          expect(oldClientSocket.readyState).toBe(WebSocket.CLOSING);
        });

        const pending = ctx.client.pending.query().catch((error) => error);
        await vi.waitFor(() => {
          expect(pendingStarted).toHaveBeenCalledTimes(1);
        });
        if (event === 'error') {
          // A masked server frame triggers a protocol error on the old socket.
          oldServerSocket.send('invalid frame', { mask: true });
        }
        oldServerSocket.resume();
        await vi.waitFor(() => {
          expect(oldClientSocket.readyState).toBe(WebSocket.CLOSED);
        });

        pendingResult.resolve('pending');
        expect(await pending).toBe('pending');
        expect(await ctx.client.greeting.query()).toBe('hello');
        expect(ctx.wsClient.connection!.ws).toBe(replacementSocket);
        expect(onOpen).toHaveBeenCalledTimes(2);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledTimes(event === 'error' ? 1 : 0);
        expect(subscriptionStarted).toHaveBeenCalledTimes(2);
        expect(onData.mock.calls).toEqual([[1], [2], [100]]);
      } finally {
        oldServerSocket?.resume();
        subscription.unsubscribe();
        await cleanup();
      }
    },
  );

  test('the old socket closing before it drains fails only its own requests', async () => {
    const {
      ctx,
      slowStarted,
      pendingResult,
      pendingStarted,
      onOpen,
      receivedFor,
      reconnectDuringSlowQuery,
      cleanup,
    } = setup();
    await using _ctx = ctx;
    try {
      const { slow, oldServerSocket, replacementSocket } =
        await reconnectDuringSlowQuery();
      const pending = ctx.client.pending.query().catch((error) => error);
      await vi.waitFor(() => {
        expect(pendingStarted).toHaveBeenCalledTimes(1);
      });

      oldServerSocket.terminate();
      expect(await slow).toMatchObject({ name: 'TRPCClientError' });

      pendingResult.resolve('pending');
      expect(await pending).toBe('pending');
      expect(slowStarted).toHaveBeenCalledTimes(1);
      expect(receivedFor('slow')).toHaveLength(1);
      expect(ctx.wsClient.connection!.ws).toBe(replacementSocket);
      expect(onOpen).toHaveBeenCalledTimes(2);
    } finally {
      await cleanup();
    }
  });

  test('connectionParams that throw on the replacement leave nothing hanging', async () => {
    const {
      ctx,
      slowStarted,
      onOpen,
      failConnectionParams,
      receivedFor,
      cleanup,
    } = setup();
    await using _ctx = ctx;
    try {
      await vi.waitFor(() => {
        expect(onOpen).toHaveBeenCalledTimes(1);
      });
      const slow = ctx.client.slow.query().catch((error) => error);
      await vi.waitFor(() => {
        expect(slowStarted).toHaveBeenCalledTimes(1);
      });
      failConnectionParams();
      ctx.wssHandler.broadcastReconnectNotification();
      await vi.waitFor(() => {
        expect(onOpen.mock.calls.length).toBeGreaterThanOrEqual(3);
      });

      receivedFor('slow')[0]!.socket.terminate();
      expect(await slow).toMatchObject({ name: 'TRPCClientError' });

      const closed = vi.fn();
      void ctx.wsClient.close().then(closed);
      await vi.waitFor(() => {
        expect(closed).toHaveBeenCalledTimes(1);
      });
      expect(receivedFor('slow')).toHaveLength(1);
    } finally {
      await cleanup();
    }
  });
});

describe('a server-requested reconnect hands subscriptions off', () => {
  function setup() {
    const t = initTRPC.create();
    const ee = new EventEmitter();
    const log: number[] = [];
    const eventsSubscribed = vi.fn();
    const valuesStarted = vi.fn();
    const slowResult = createDeferred<string>();
    const onOpen = vi.fn();
    let connectionParamsGate: Promise<void> | null = null;
    let failConnectionParams = false;
    let connectionParamsFailures = 0;
    let subscriptionGate: Promise<void> | null = null;
    // The server sends `started` once the procedure call has resolved.
    const subscriptionProcedure = t.procedure.use(async (opts) => {
      await subscriptionGate;
      return opts.next();
    });
    const router = t.router({
      greeting: t.procedure.query(() => 'hello'),
      slow: t.procedure.query(() => slowResult.promise),
      double: t.procedure.input(z.number()).mutation(({ input }) => input * 2),
      events: subscriptionProcedure
        .input(z.object({ lastEventId: z.string().nullish() }).optional())
        .subscription(async function* (opts) {
          eventsSubscribed(opts.input?.lastEventId ?? null);
          let index = Number(opts.input?.lastEventId ?? 0);
          const pushed = on(ee, 'push', { signal: opts.signal });
          while (true) {
            while (index < log.length) {
              index++;
              yield tracked(String(index), log[index - 1]!);
            }
            await pushed.next();
          }
        }),
      values: subscriptionProcedure.subscription(() =>
        observable<number>((emit) => {
          valuesStarted();
          const onValue = (value: number) => emit.next(value);
          ee.on('value', onValue);
          return () => {
            ee.off('value', onValue);
          };
        }),
      ),
    });
    const ctx = testServerAndClientResource(router, {
      clientLink: 'wsLink',
      wsClient: {
        lazy: { enabled: false, closeMs: 0 },
        retryDelayMs: () => 20,
        onOpen,
        connectionParams: async () => {
          if (failConnectionParams) {
            throw new Error(
              `token unavailable (${++connectionParamsFailures})`,
            );
          }
          await connectionParamsGate;
          return { token: 'ok' };
        },
      },
    });

    /** The requests the server received, with the socket each came on. */
    const received: {
      socket: WebSocket;
      id: unknown;
      method: unknown;
      path: unknown;
    }[] = [];
    ctx.wss.on('connection', (socket) => {
      socket.on('message', (data) => {
        // oxlint-disable-next-line typescript/no-base-to-string
        const text = data.toString();
        if (text === 'PING' || text === 'PONG') return;
        for (const message of [JSON.parse(text)].flat()) {
          if (message.method !== 'connectionParams') {
            received.push({
              socket,
              id: message.id,
              method: message.method,
              path: message.params?.path,
            });
          }
        }
      });
    });
    const receivedFor = (path: string) =>
      received.filter((request) => request.path === path);
    /** The ids of the subscriptions `socket` was asked to stop. */
    const stopsOn = (socket: WebSocket) =>
      received
        .filter(
          (request) =>
            request.socket === socket && request.method === 'subscription.stop',
        )
        .map((request) => request.id);

    /** Records the results `ws` receives. */
    function resultsOn(ws: globalThis.WebSocket) {
      const results: { id: unknown; type: unknown; eventId?: unknown }[] = [];
      ws.addEventListener('message', ({ data }) => {
        const text =
          typeof data === 'string' ? data : String(Buffer.from(data));
        if (text === 'PING' || text === 'PONG') return;
        const message = JSON.parse(text);
        if ('result' in message) {
          results.push({
            id: message.id,
            type: message.result.type,
            eventId: message.result.id,
          });
        }
      });
      return results;
    }

    /** What a subscriber sees, in order, apart from its data. */
    function observe(seen: unknown[]) {
      return {
        onStarted: () => seen.push('started'),
        onStopped: () => seen.push('stopped'),
        onComplete: () => seen.push('complete'),
        onError: (error: unknown) => seen.push(error),
        onConnectionStateChange: ({ state }: { state: string }) =>
          seen.push(state),
      };
    }

    async function waitForOpen() {
      await vi.waitFor(() => {
        expect(ctx.wsClient.connection?.state).toBe('open');
      });
      return {
        oldClientSocket: ctx.wsClient.connection!.ws,
        oldServerSocket: [...ctx.wss.clients][0]!,
      };
    }

    return {
      ctx,
      ee,
      eventsSubscribed,
      valuesStarted,
      slowResult,
      onOpen,
      receivedFor,
      stopsOn,
      resultsOn,
      observe,
      waitForOpen,
      push: (value: number) => {
        log.push(value);
        ee.emit('push');
      },
      /** Holds `connectionParams` back until the returned deferred resolves. */
      holdConnectionParams: () => {
        const gate = createDeferred<void>();
        connectionParamsGate = gate.promise;
        return gate;
      },
      failConnectionParams: (fail: boolean) => {
        failConnectionParams = fail;
      },
      /** Holds back `started` for subscriptions that arrive from now on. */
      holdSubscriptions: () => {
        const gate = createDeferred<void>();
        subscriptionGate = gate.promise;
        return gate;
      },
    };
  }

  test('a moved subscription gets every event exactly once', async () => {
    const {
      ctx,
      push,
      eventsSubscribed,
      onOpen,
      resultsOn,
      observe,
      waitForOpen,
      holdConnectionParams,
    } = setup();
    await using _ctx = ctx;
    const { oldClientSocket, oldServerSocket } = await waitForOpen();
    const oldResults = resultsOn(oldClientSocket);
    const seen: unknown[] = [];
    const subscription = ctx.client.events.subscribe(undefined, {
      ...observe(seen),
      onData: ({ data }) => seen.push(data),
    });
    const release = holdConnectionParams();
    try {
      await vi.waitFor(() => {
        expect(eventsSubscribed).toHaveBeenCalledTimes(1);
      });
      push(1);
      push(2);
      await vi.waitFor(() => {
        expect(seen).toContain(2);
      });

      ctx.wssHandler.broadcastReconnectNotification();
      await vi.waitFor(() => {
        expect(onOpen).toHaveBeenCalledTimes(2);
      });
      // The old socket delivers until the new one has sent connectionParams.
      push(3);
      await vi.waitFor(() => {
        expect(seen).toContain(3);
      });
      expect(ctx.wsClient.connection!.ws).toBe(oldClientSocket);

      // The old socket won't see the stop yet, so it sends event 4 too.
      oldServerSocket.pause();
      release.resolve();
      await vi.waitFor(() => {
        expect(eventsSubscribed).toHaveBeenCalledTimes(2);
      });
      expect(eventsSubscribed).toHaveBeenLastCalledWith('3');
      push(4);
      await vi.waitFor(() => {
        expect(seen).toContain(4);
        expect(oldResults).toContainEqual(
          expect.objectContaining({ type: 'data', eventId: '4' }),
        );
      });
      oldServerSocket.resume();
      await vi.waitFor(() => {
        expect(oldClientSocket.readyState).toBe(WebSocket.CLOSED);
      });

      push(5);
      await vi.waitFor(() => {
        expect(seen).toContain(5);
      });
      expect(seen).toEqual(['pending', 'started', 1, 2, 3, 4, 5]);
      expect(eventsSubscribed).toHaveBeenCalledTimes(2);
    } finally {
      release.resolve();
      oldServerSocket.resume();
      subscription.unsubscribe();
      await ctx.wsClient.close();
    }
  });

  test('a subscription moved before its first event keeps the input lastEventId', async () => {
    const { ctx, push, eventsSubscribed, observe, waitForOpen } = setup();
    await using _ctx = ctx;
    push(1);
    push(2);
    await waitForOpen();
    const seen: unknown[] = [];
    const subscription = ctx.client.events.subscribe(
      { lastEventId: '2' },
      { ...observe(seen), onData: ({ data }) => seen.push(data) },
    );
    try {
      await vi.waitFor(() => {
        expect(eventsSubscribed).toHaveBeenCalledTimes(1);
      });

      ctx.wssHandler.broadcastReconnectNotification();
      await vi.waitFor(() => {
        expect(eventsSubscribed).toHaveBeenCalledTimes(2);
      });
      expect(eventsSubscribed.mock.calls).toEqual([['2'], ['2']]);

      push(3);
      await vi.waitFor(() => {
        expect(seen).toContain(3);
      });
      expect(seen).toEqual(['pending', 'started', 3]);
    } finally {
      subscription.unsubscribe();
      await ctx.wsClient.close();
    }
  });

  test('a subscription moved before its started arrived still reports onStarted once', async () => {
    const { ctx, ee, valuesStarted, observe, waitForOpen } = setup();
    await using _ctx = ctx;
    const { oldClientSocket, oldServerSocket } = await waitForOpen();
    // The old socket won't see the subscription until it's resumed.
    oldServerSocket.pause();
    const sent = vi.spyOn(oldClientSocket, 'send');
    const seen: unknown[] = [];
    const subscription = ctx.client.values.subscribe(undefined, {
      ...observe(seen),
      onData: (value) => seen.push(value),
    });
    try {
      await vi.waitFor(() => {
        expect(sent).toHaveBeenCalledTimes(1);
      });
      ctx.wssHandler.broadcastReconnectNotification();
      await vi.waitFor(() => {
        expect(valuesStarted).toHaveBeenCalledTimes(1);
      });
      ee.emit('value', 1);
      await vi.waitFor(() => {
        expect(seen).toContain(1);
      });

      oldServerSocket.resume();
      await vi.waitFor(() => {
        expect(oldClientSocket.readyState).toBe(WebSocket.CLOSED);
      });
      expect(seen).toEqual(['pending', 'started', 1]);
    } finally {
      oldServerSocket.resume();
      subscription.unsubscribe();
      await ctx.wsClient.close();
    }
  });

  test("the old socket's data and stopped for a moved subscription are dropped", async () => {
    const {
      ctx,
      push,
      eventsSubscribed,
      slowResult,
      receivedFor,
      resultsOn,
      observe,
      waitForOpen,
    } = setup();
    await using _ctx = ctx;
    const { oldClientSocket, oldServerSocket } = await waitForOpen();
    const oldResults = resultsOn(oldClientSocket);
    const seen: unknown[] = [];
    const subscription = ctx.client.events.subscribe(undefined, {
      ...observe(seen),
      onData: ({ data }) => seen.push(data),
    });
    // Keeps the old socket open after the subscription moves.
    const slow = ctx.client.slow.query();
    try {
      await vi.waitFor(() => {
        expect(eventsSubscribed).toHaveBeenCalledTimes(1);
        expect(receivedFor('slow')).toHaveLength(1);
      });
      const { id } = receivedFor('events')[0]!;

      // The old socket won't see the stop until it's resumed.
      oldServerSocket.pause();
      ctx.wssHandler.broadcastReconnectNotification();
      await vi.waitFor(() => {
        expect(eventsSubscribed).toHaveBeenCalledTimes(2);
      });
      push(1);
      await vi.waitFor(() => {
        expect(oldResults).toContainEqual({ id, type: 'data', eventId: '1' });
      });
      oldServerSocket.resume();
      await vi.waitFor(() => {
        expect(oldResults).toContainEqual({ id, type: 'stopped' });
      });
      expect(oldClientSocket.readyState).toBe(WebSocket.OPEN);

      slowResult.resolve('slow');
      expect(await slow).toBe('slow');
      await vi.waitFor(() => {
        expect(oldClientSocket.readyState).toBe(WebSocket.CLOSED);
      });
      push(2);
      await vi.waitFor(() => {
        expect(seen).toContain(2);
      });
      expect(seen).toEqual(['pending', 'started', 1, 2]);
    } finally {
      slowResult.resolve('cleanup');
      oldServerSocket.resume();
      subscription.unsubscribe();
      await ctx.wsClient.close();
    }
  });

  test('the old socket stays open and serves its subscriptions and new requests until the new one opens', async () => {
    const {
      ctx,
      ee,
      valuesStarted,
      onOpen,
      receivedFor,
      observe,
      waitForOpen,
      holdConnectionParams,
    } = setup();
    await using _ctx = ctx;
    const { oldClientSocket, oldServerSocket } = await waitForOpen();
    const seen: unknown[] = [];
    const subscription = ctx.client.values.subscribe(undefined, {
      ...observe(seen),
      onData: (value) => seen.push(value),
    });
    const release = holdConnectionParams();
    try {
      await vi.waitFor(() => {
        expect(valuesStarted).toHaveBeenCalledTimes(1);
      });

      ctx.wssHandler.broadcastReconnectNotification();
      await vi.waitFor(() => {
        expect(onOpen).toHaveBeenCalledTimes(2);
      });
      ee.emit('value', 1);
      await vi.waitFor(() => {
        expect(seen).toContain(1);
      });
      // A request sent now goes to the old socket.
      expect(await ctx.client.greeting.query()).toBe('hello');
      expect(receivedFor('greeting')[0]!.socket).toBe(oldServerSocket);
      expect(oldClientSocket.readyState).toBe(WebSocket.OPEN);
      expect(ctx.wsClient.connection!.ws).toBe(oldClientSocket);

      release.resolve();
      await vi.waitFor(() => {
        expect(oldClientSocket.readyState).toBe(WebSocket.CLOSED);
      });
      ee.emit('value', 2);
      await vi.waitFor(() => {
        expect(seen).toContain(2);
      });
      expect(valuesStarted).toHaveBeenCalledTimes(2);
      expect(seen).toEqual(['pending', 'started', 1, 2]);
    } finally {
      release.resolve();
      subscription.unsubscribe();
      await ctx.wsClient.close();
    }
  });

  test("a new socket that can't open leaves everything on the old one until the server closes it", async () => {
    const {
      ctx,
      ee,
      valuesStarted,
      onOpen,
      receivedFor,
      observe,
      waitForOpen,
      holdConnectionParams,
      failConnectionParams,
    } = setup();
    await using _ctx = ctx;
    const { oldClientSocket, oldServerSocket } = await waitForOpen();
    const seen: unknown[] = [];
    const subscription = ctx.client.values.subscribe(undefined, {
      ...observe(seen),
      onData: (value) => seen.push(value),
    });
    // Throwing comes first, so this holds back only the attempt after.
    const release = holdConnectionParams();
    try {
      await vi.waitFor(() => {
        expect(valuesStarted).toHaveBeenCalledTimes(1);
      });

      failConnectionParams(true);
      ctx.wssHandler.broadcastReconnectNotification();
      await vi.waitFor(() => {
        expect(onOpen.mock.calls.length).toBeGreaterThanOrEqual(3);
      });
      ee.emit('value', 1);
      await vi.waitFor(() => {
        expect(seen).toContain(1);
      });
      expect(await ctx.client.greeting.query()).toBe('hello');
      expect(receivedFor('greeting')[0]!.socket).toBe(oldServerSocket);
      expect(oldClientSocket.readyState).toBe(WebSocket.OPEN);
      expect(seen).toEqual(['pending', 'started', 1]);

      failConnectionParams(false);
      oldServerSocket.terminate();
      await vi.waitFor(() => {
        expect(oldClientSocket.readyState).toBe(WebSocket.CLOSED);
      });

      // Nothing serves requests until the new socket is ready.
      const settled = vi.fn();
      void ctx.client.greeting.query().then(settled);
      await sleep(50);
      expect(settled).not.toHaveBeenCalled();
      release.resolve();
      await vi.waitFor(() => {
        expect(settled).toHaveBeenCalledWith('hello');
        expect(valuesStarted).toHaveBeenCalledTimes(2);
      });
      expect(receivedFor('greeting')).toHaveLength(2);
      expect(receivedFor('greeting')[1]!.socket).not.toBe(oldServerSocket);
      ee.emit('value', 2);
      await vi.waitFor(() => {
        expect(seen).toContain(2);
      });
      expect(seen.filter((entry) => entry === 'stopped')).toEqual([]);
    } finally {
      failConnectionParams(false);
      release.resolve();
      subscription.unsubscribe();
      await ctx.wsClient.close();
    }
  });

  test('failed attempts to replace an open socket leave it serving every request', async () => {
    const {
      ctx,
      ee,
      valuesStarted,
      onOpen,
      receivedFor,
      waitForOpen,
      failConnectionParams,
    } = setup();
    await using _ctx = ctx;
    const { oldServerSocket } = await waitForOpen();
    const states: { state: string; error: unknown }[] = [];
    const data: number[] = [];
    const onStarted = vi.fn();
    const subscription = ctx.client.values.subscribe(undefined, {
      onStarted,
      onData: (value) => data.push(value),
      onConnectionStateChange: ({ state, error }) =>
        states.push({ state, error }),
    });
    try {
      await vi.waitFor(() => {
        expect(valuesStarted).toHaveBeenCalledTimes(1);
      });

      failConnectionParams(true);
      ctx.wssHandler.broadcastReconnectNotification();
      // Three replacements open and fail sending connectionParams.
      await vi.waitFor(() => {
        expect(onOpen.mock.calls.length).toBeGreaterThanOrEqual(4);
      });
      ee.emit('value', 1);
      await vi.waitFor(() => {
        expect(data).toEqual([1]);
      });
      expect(await ctx.client.greeting.query()).toBe('hello');
      expect(receivedFor('greeting')[0]!.socket).toBe(oldServerSocket);
      expect(states).toEqual([{ state: 'pending', error: null }]);
      expect(onStarted).toHaveBeenCalledTimes(1);

      // The last failure shows once the old socket ends.
      oldServerSocket.terminate();
      await vi.waitFor(() => {
        expect(states[1]).toEqual({
          state: 'connecting',
          error: expect.objectContaining({
            message: 'Initialization error',
            cause: expect.objectContaining({
              cause: expect.objectContaining({
                message: expect.stringMatching(/^token unavailable/),
              }),
            }),
          }),
        });
      });
      failConnectionParams(false);
      await vi.waitFor(() => {
        expect(valuesStarted).toHaveBeenCalledTimes(2);
      });
      ee.emit('value', 2);
      await vi.waitFor(() => {
        expect(data).toEqual([1, 2]);
      });
    } finally {
      failConnectionParams(false);
      subscription.unsubscribe();
      await ctx.wsClient.close();
    }
  });

  test('a query and a mutation sent while the new socket opens go to the old one', async () => {
    const { ctx, onOpen, receivedFor, waitForOpen, holdConnectionParams } =
      setup();
    await using _ctx = ctx;
    const { oldServerSocket } = await waitForOpen();
    const release = holdConnectionParams();
    try {
      ctx.wssHandler.broadcastReconnectNotification();
      await vi.waitFor(() => {
        expect(onOpen).toHaveBeenCalledTimes(2);
      });

      const settled = vi.fn();
      void Promise.all([
        ctx.client.greeting.query(),
        ctx.client.double.mutate(2),
      ]).then(settled);
      await vi.waitFor(() => {
        expect(settled).toHaveBeenCalledWith(['hello', 4]);
      });
      expect(receivedFor('greeting').map(({ socket }) => socket)).toEqual([
        oldServerSocket,
      ]);
      expect(receivedFor('double').map(({ socket }) => socket)).toEqual([
        oldServerSocket,
      ]);
    } finally {
      release.resolve();
      await ctx.wsClient.close();
    }
  });

  test('a subscription opened while the new socket opens starts on the old one and moves', async () => {
    const {
      ctx,
      ee,
      valuesStarted,
      onOpen,
      receivedFor,
      stopsOn,
      observe,
      waitForOpen,
      holdConnectionParams,
      holdSubscriptions,
    } = setup();
    await using _ctx = ctx;
    const { oldClientSocket, oldServerSocket } = await waitForOpen();
    const release = holdConnectionParams();
    let held: ReturnType<typeof holdSubscriptions> | undefined;
    const seen: unknown[] = [];
    let subscription: { unsubscribe: () => void } | undefined;
    try {
      ctx.wssHandler.broadcastReconnectNotification();
      await vi.waitFor(() => {
        expect(onOpen).toHaveBeenCalledTimes(2);
      });
      subscription = ctx.client.values.subscribe(undefined, {
        ...observe(seen),
        onData: (value) => seen.push(value),
      });
      await vi.waitFor(() => {
        expect(valuesStarted).toHaveBeenCalledTimes(1);
      });
      expect(receivedFor('values')[0]!.socket).toBe(oldServerSocket);
      ee.emit('value', 1);
      await vi.waitFor(() => {
        expect(seen).toContain(1);
      });

      held = holdSubscriptions();
      release.resolve();
      await vi.waitFor(() => {
        expect(receivedFor('values')).toHaveLength(2);
      });
      ee.emit('value', 2);
      await vi.waitFor(() => {
        expect(seen).toContain(2);
      });
      expect(stopsOn(oldServerSocket)).toEqual([]);

      held.resolve();
      await vi.waitFor(() => {
        expect(valuesStarted).toHaveBeenCalledTimes(2);
        expect(oldClientSocket.readyState).toBe(WebSocket.CLOSED);
      });
      expect(stopsOn(oldServerSocket)).toEqual([receivedFor('values')[0]!.id]);
      ee.emit('value', 3);
      await vi.waitFor(() => {
        expect(seen).toContain(3);
      });
      expect(seen).toEqual(['pending', 'started', 1, 2, 3]);
    } finally {
      release.resolve();
      held?.resolve();
      subscription?.unsubscribe();
      await ctx.wsClient.close();
    }
  });

  test('a tracked subscription is served by the old socket until the new one has started it', async () => {
    const {
      ctx,
      push,
      eventsSubscribed,
      receivedFor,
      resultsOn,
      observe,
      waitForOpen,
      holdSubscriptions,
    } = setup();
    await using _ctx = ctx;
    const { oldClientSocket, oldServerSocket } = await waitForOpen();
    const oldResults = resultsOn(oldClientSocket);
    const seen: unknown[] = [];
    const subscription = ctx.client.events.subscribe(undefined, {
      ...observe(seen),
      onData: ({ data }) => seen.push(data),
    });
    let held: ReturnType<typeof holdSubscriptions> | undefined;
    try {
      await vi.waitFor(() => {
        expect(eventsSubscribed).toHaveBeenCalledTimes(1);
      });
      push(1);
      await vi.waitFor(() => {
        expect(seen).toContain(1);
      });

      held = holdSubscriptions();
      ctx.wssHandler.broadcastReconnectNotification();
      await vi.waitFor(() => {
        expect(receivedFor('events')).toHaveLength(2);
      });
      const newResults = resultsOn(ctx.wsClient.connection!.ws);
      push(2);
      push(3);
      await vi.waitFor(() => {
        expect(seen).toContain(3);
      });
      expect(receivedFor('events')[1]!.socket).not.toBe(oldServerSocket);

      held.resolve();
      await vi.waitFor(() => {
        expect(oldClientSocket.readyState).toBe(WebSocket.CLOSED);
        expect(newResults).toContainEqual(
          expect.objectContaining({ type: 'data', eventId: '3' }),
        );
      });
      push(4);
      await vi.waitFor(() => {
        expect(seen).toContain(4);
      });
      expect(seen).toEqual(['pending', 'started', 1, 2, 3, 4]);
      expect(eventsSubscribed.mock.calls).toEqual([[null], ['1']]);
      for (const results of [oldResults, newResults]) {
        expect(
          results.filter(({ type }) => type === 'data').map((r) => r.eventId),
        ).toEqual(expect.arrayContaining(['2', '3']));
      }
    } finally {
      held?.resolve();
      subscription.unsubscribe();
      await ctx.wsClient.close();
    }
  });

  test('a subscription is stopped on the old socket only once the new one has started it', async () => {
    const {
      ctx,
      valuesStarted,
      receivedFor,
      stopsOn,
      waitForOpen,
      holdSubscriptions,
    } = setup();
    await using _ctx = ctx;
    const { oldServerSocket } = await waitForOpen();
    const subscription = ctx.client.values.subscribe(undefined, {
      onData: () => null,
    });
    let held: ReturnType<typeof holdSubscriptions> | undefined;
    try {
      await vi.waitFor(() => {
        expect(valuesStarted).toHaveBeenCalledTimes(1);
      });

      held = holdSubscriptions();
      ctx.wssHandler.broadcastReconnectNotification();
      await vi.waitFor(() => {
        expect(receivedFor('values')).toHaveLength(2);
      });
      // A round trip on the new socket, so a stop sent with the move would have arrived.
      expect(await ctx.client.greeting.query()).toBe('hello');
      expect(stopsOn(oldServerSocket)).toEqual([]);

      held.resolve();
      await vi.waitFor(() => {
        expect(stopsOn(oldServerSocket)).toEqual([
          receivedFor('values')[0]!.id,
        ]);
      });
    } finally {
      held?.resolve();
      subscription.unsubscribe();
      await ctx.wsClient.close();
    }
  });

  test('an idle old socket stays open until the new one opens', async () => {
    const { ctx, onOpen, waitForOpen, holdConnectionParams } = setup();
    await using _ctx = ctx;
    const { oldClientSocket } = await waitForOpen();
    const release = holdConnectionParams();
    try {
      ctx.wssHandler.broadcastReconnectNotification();
      await vi.waitFor(() => {
        expect(onOpen).toHaveBeenCalledTimes(2);
      });
      await sleep(50);
      expect(oldClientSocket.readyState).toBe(WebSocket.OPEN);
      expect(ctx.wsClient.connection!.ws).toBe(oldClientSocket);

      release.resolve();
      await vi.waitFor(() => {
        expect(oldClientSocket.readyState).toBe(WebSocket.CLOSED);
      });
    } finally {
      release.resolve();
      await ctx.wsClient.close();
    }
  });

  test('the old socket closes once its requests have drained and its subscriptions have moved', async () => {
    const {
      ctx,
      valuesStarted,
      slowResult,
      receivedFor,
      waitForOpen,
      holdSubscriptions,
    } = setup();
    await using _ctx = ctx;
    const { oldClientSocket } = await waitForOpen();
    const subscription = ctx.client.values.subscribe(undefined, {
      onData: () => null,
    });
    const slow = ctx.client.slow.query();
    let held: ReturnType<typeof holdSubscriptions> | undefined;
    try {
      await vi.waitFor(() => {
        expect(valuesStarted).toHaveBeenCalledTimes(1);
        expect(receivedFor('slow')).toHaveLength(1);
      });

      held = holdSubscriptions();
      ctx.wssHandler.broadcastReconnectNotification();
      await vi.waitFor(() => {
        expect(receivedFor('values')).toHaveLength(2);
      });
      slowResult.resolve('slow');
      expect(await slow).toBe('slow');
      // Another round trip, so a close sent on the drain would have arrived.
      expect(await ctx.client.greeting.query()).toBe('hello');
      expect(oldClientSocket.readyState).toBe(WebSocket.OPEN);

      held.resolve();
      await vi.waitFor(() => {
        expect(oldClientSocket.readyState).toBe(WebSocket.CLOSED);
      });
      expect(valuesStarted).toHaveBeenCalledTimes(2);
    } finally {
      slowResult.resolve('cleanup');
      held?.resolve();
      subscription.unsubscribe();
      await ctx.wsClient.close();
    }
  });

  test('the old socket closing while a subscription moves leaves it on the new one with no gap or duplicate', async () => {
    const {
      ctx,
      push,
      eventsSubscribed,
      receivedFor,
      observe,
      waitForOpen,
      holdSubscriptions,
    } = setup();
    await using _ctx = ctx;
    const { oldClientSocket, oldServerSocket } = await waitForOpen();
    const seen: unknown[] = [];
    const subscription = ctx.client.events.subscribe(undefined, {
      ...observe(seen),
      onData: ({ data }) => seen.push(data),
    });
    let held: ReturnType<typeof holdSubscriptions> | undefined;
    try {
      await vi.waitFor(() => {
        expect(eventsSubscribed).toHaveBeenCalledTimes(1);
      });
      push(1);
      await vi.waitFor(() => {
        expect(seen).toContain(1);
      });

      held = holdSubscriptions();
      ctx.wssHandler.broadcastReconnectNotification();
      await vi.waitFor(() => {
        expect(receivedFor('events')).toHaveLength(2);
      });
      push(2);
      push(3);
      await vi.waitFor(() => {
        expect(seen).toContain(3);
      });

      oldServerSocket.terminate();
      await vi.waitFor(() => {
        expect(oldClientSocket.readyState).toBe(WebSocket.CLOSED);
      });
      push(4);
      held.resolve();
      await vi.waitFor(() => {
        expect(seen).toContain(4);
      });
      expect(seen).toEqual(['pending', 'started', 1, 2, 3, 4]);
      expect(eventsSubscribed.mock.calls).toEqual([[null], ['1']]);
      expect(receivedFor('events')).toHaveLength(2);
    } finally {
      held?.resolve();
      subscription.unsubscribe();
      await ctx.wsClient.close();
    }
  });

  test('a new socket lost before it starts a subscription leaves the subscription on the old one', async () => {
    const {
      ctx,
      push,
      eventsSubscribed,
      onOpen,
      receivedFor,
      stopsOn,
      observe,
      waitForOpen,
      holdConnectionParams,
      holdSubscriptions,
    } = setup();
    await using _ctx = ctx;
    const { oldClientSocket, oldServerSocket } = await waitForOpen();
    const seen: unknown[] = [];
    const subscription = ctx.client.events.subscribe(undefined, {
      ...observe(seen),
      onData: ({ data }) => seen.push(data),
    });
    let held: ReturnType<typeof holdSubscriptions> | undefined;
    let release: ReturnType<typeof holdConnectionParams> | undefined;
    try {
      await vi.waitFor(() => {
        expect(eventsSubscribed).toHaveBeenCalledTimes(1);
      });
      push(1);
      await vi.waitFor(() => {
        expect(seen).toContain(1);
      });

      held = holdSubscriptions();
      ctx.wssHandler.broadcastReconnectNotification();
      await vi.waitFor(() => {
        expect(receivedFor('events')).toHaveLength(2);
      });
      release = holdConnectionParams();
      const lostServerSocket = receivedFor('events')[1]!.socket;
      lostServerSocket.terminate();
      await vi.waitFor(() => {
        expect(onOpen).toHaveBeenCalledTimes(3);
      });

      // The old socket serves everything again until the next new socket.
      expect(ctx.wsClient.connection!.ws).toBe(oldClientSocket);
      expect(await ctx.client.greeting.query()).toBe('hello');
      expect(receivedFor('greeting')[0]!.socket).toBe(oldServerSocket);
      push(2);
      await vi.waitFor(() => {
        expect(seen).toContain(2);
      });
      expect(stopsOn(oldServerSocket)).toEqual([]);

      release.resolve();
      await vi.waitFor(() => {
        expect(receivedFor('events')).toHaveLength(3);
      });
      held.resolve();
      await vi.waitFor(() => {
        expect(oldClientSocket.readyState).toBe(WebSocket.CLOSED);
      });
      push(3);
      await vi.waitFor(() => {
        expect(seen).toContain(3);
      });
      expect(seen).toEqual(['pending', 'started', 1, 2, 3]);
    } finally {
      release?.resolve();
      held?.resolve();
      subscription.unsubscribe();
      await ctx.wsClient.close();
    }
  });

  test('an untracked subscription gets the events the old socket sent before it was stopped there', async () => {
    const {
      ctx,
      ee,
      valuesStarted,
      receivedFor,
      observe,
      waitForOpen,
      holdSubscriptions,
    } = setup();
    await using _ctx = ctx;
    const { oldClientSocket, oldServerSocket } = await waitForOpen();
    const seen: unknown[] = [];
    const subscription = ctx.client.values.subscribe(undefined, {
      ...observe(seen),
      onData: (value) => seen.push(value),
    });
    let held: ReturnType<typeof holdSubscriptions> | undefined;
    try {
      await vi.waitFor(() => {
        expect(valuesStarted).toHaveBeenCalledTimes(1);
      });

      held = holdSubscriptions();
      ctx.wssHandler.broadcastReconnectNotification();
      await vi.waitFor(() => {
        expect(receivedFor('values')).toHaveLength(2);
      });
      // The old socket's frames now arrive after the new socket's.
      const send = oldServerSocket.send.bind(oldServerSocket) as (
        ...args: unknown[]
      ) => void;
      Object.assign(oldServerSocket, {
        send: (...args: unknown[]) => setTimeout(() => send(...args), 50),
      });
      // Only the old socket listens yet.
      ee.emit('value', 1);
      held.resolve();
      await vi.waitFor(() => {
        expect(oldClientSocket.readyState).toBe(WebSocket.CLOSED);
      });
      ee.emit('value', 2);
      await vi.waitFor(() => {
        expect(seen).toContain(2);
      });
      expect(seen).toEqual(['pending', 'started', 1, 2]);
    } finally {
      held?.resolve();
      subscription.unsubscribe();
      await ctx.wsClient.close();
    }
  });

  test('wsClient.close() during the handoff closes both sockets', async () => {
    const {
      ctx,
      valuesStarted,
      onOpen,
      observe,
      waitForOpen,
      holdConnectionParams,
    } = setup();
    await using _ctx = ctx;
    const { oldClientSocket } = await waitForOpen();
    const seen: unknown[] = [];
    const subscription = ctx.client.values.subscribe(undefined, {
      ...observe(seen),
      onData: (value) => seen.push(value),
    });
    const release = holdConnectionParams();
    try {
      await vi.waitFor(() => {
        expect(valuesStarted).toHaveBeenCalledTimes(1);
      });
      ctx.wssHandler.broadcastReconnectNotification();
      await vi.waitFor(() => {
        expect(onOpen).toHaveBeenCalledTimes(2);
      });

      await ctx.wsClient.close();
      expect(seen.at(-1)).toBe('complete');
      await vi.waitFor(() => {
        expect(oldClientSocket.readyState).toBe(WebSocket.CLOSED);
        expect(ctx.wss.clients.size).toBe(0);
      });
      expect(valuesStarted).toHaveBeenCalledTimes(1);
    } finally {
      release.resolve();
      subscription.unsubscribe();
      await ctx.wsClient.close();
    }
  });

  test('a subscription sent while slow connectionParams are pending survives a server reconnect request', async () => {
    const {
      ctx,
      ee,
      valuesStarted,
      onOpen,
      receivedFor,
      observe,
      holdConnectionParams,
    } = setup();
    await using _ctx = ctx;
    const release = holdConnectionParams();
    const notified = createDeferred<void>();
    ctx.wss.once('connection', () => {
      setImmediate(() => {
        ctx.wssHandler.broadcastReconnectNotification();
        notified.resolve();
      });
    });
    const seen: unknown[] = [];
    const subscription = ctx.client.values.subscribe(undefined, {
      ...observe(seen),
      onData: (value) => seen.push(value),
    });
    const greeting = ctx.client.greeting.query();
    try {
      await notified.promise;
      // Past the 20ms retry delay.
      await sleep(50);
      release.resolve();

      expect(await greeting).toBe('hello');
      await vi.waitFor(() => {
        expect(valuesStarted).toHaveBeenCalledTimes(1);
      });
      ee.emit('value', 1);
      await vi.waitFor(() => {
        expect(seen).toContain(1);
      });
      expect(onOpen).toHaveBeenCalledTimes(2);
      expect(receivedFor('values')).toHaveLength(1);
      expect(seen.filter((entry) => entry instanceof Error)).toEqual([]);
    } finally {
      release.resolve();
      subscription.unsubscribe();
      await ctx.wsClient.close();
    }
  });

  test('a tracked subscription gets no duplicate from the closing old socket', async () => {
    const { ctx, push, eventsSubscribed, waitForOpen } = setup();
    await using _ctx = ctx;
    const { oldClientSocket, oldServerSocket } = await waitForOpen();
    const data: number[] = [];
    const subscription = ctx.client.events.subscribe(undefined, {
      onData: (event) => data.push(event.data),
    });
    try {
      await vi.waitFor(() => {
        expect(eventsSubscribed).toHaveBeenCalledTimes(1);
      });
      push(1);
      push(2);
      await vi.waitFor(() => {
        expect(data).toEqual([1, 2]);
      });

      oldServerSocket.pause();
      ctx.wssHandler.broadcastReconnectNotification();
      await vi.waitFor(() => {
        expect(eventsSubscribed).toHaveBeenCalledTimes(2);
      });
      expect(eventsSubscribed).toHaveBeenLastCalledWith('2');
      push(3);
      await vi.waitFor(() => {
        expect(data).toContain(3);
      });
      oldServerSocket.resume();
      await vi.waitFor(() => {
        expect(oldClientSocket.readyState).toBe(WebSocket.CLOSED);
      });
      push(4);
      await vi.waitFor(() => {
        expect(data).toContain(4);
      });
      expect(data).toEqual([1, 2, 3, 4]);
      expect(eventsSubscribed).toHaveBeenCalledTimes(2);
    } finally {
      oldServerSocket.resume();
      subscription.unsubscribe();
      await ctx.wsClient.close();
    }
  });
});

test('subscriptions are automatically resumed if connection is lost', async () => {
  await using ctx = factory();
  ctx.ee.once('subscription:created', () => {
    setTimeout(() => {
      ctx.ee.emit('server:msg', {
        id: '1',
      });
    });
  });
  function createSub() {
    const onStartedMock = vi.fn();
    const onDataMock = vi.fn();
    const onErrorMock = vi.fn();
    const onStoppedMock = vi.fn();
    const onCompleteMock = vi.fn();
    const unsub = ctx.client.onMessageObservable.subscribe(undefined, {
      onStarted: onStartedMock,
      onData: onDataMock,
      onError: onErrorMock,
      onStopped: onStoppedMock,
      onComplete: onCompleteMock,
    });
    return {
      onStartedMock,
      onDataMock,
      onErrorMock,
      onStoppedMock,
      onCompleteMock,
      unsub,
    };
  }
  const sub1 = createSub();

  await vi.waitFor(() => {
    expect(sub1.onStartedMock).toHaveBeenCalledTimes(1);
    expect(sub1.onDataMock).toHaveBeenCalledTimes(1);
    expect(ctx.onOpenMock).toHaveBeenCalledTimes(1);
    expect(ctx.onCloseMock).toHaveBeenCalledTimes(0);
  });
  // close connections forcefully
  ctx.wss.clients.forEach((ws) => ws.close());
  await vi.waitFor(() => {
    expect(ctx.wss.clients.size).toBe(1);
    expect(ctx.onOpenMock).toHaveBeenCalledTimes(2);
    expect(ctx.onCloseMock).toHaveBeenCalledTimes(1);
  });

  // A lost connection resubscribes, and the new socket's started is delivered.
  await vi.waitFor(() => {
    expect(sub1.onStartedMock).toHaveBeenCalledTimes(2);
    expect(sub1.onDataMock).toHaveBeenCalledTimes(1);
  });
  ctx.ee.emit('server:msg', {
    id: '2',
  });

  await vi.waitFor(() => {
    expect(sub1.onDataMock).toHaveBeenCalledTimes(2);
  });
  expect(sub1.onDataMock.mock.calls.map((args) => args[0]))
    .toMatchInlineSnapshot(`
    Array [
      Object {
        "id": "1",
      },
      Object {
        "id": "2",
      },
    ]
  `);
  await vi.waitFor(() => {
    expect(ctx.wss.clients.size).toBe(1);
  });

  // Note: With await using, the second close event might not be captured
  // as the test context is cleaned up automatically
  expect(ctx.onCloseMock).toHaveBeenCalledTimes(1);
});

test('not found error', async () => {
  await using ctx = factory();

  const error = await waitError<TRPCClientError<typeof ctx.router>>(
    // @ts-expect-error - testing runtime typeerrors
    ctx.client.notFound.query(),
  );

  expect(error.name).toBe('TRPCClientError');
  expect(error.shape?.data.code).toMatchInlineSnapshot(`"NOT_FOUND"`);
});

test('batching', async () => {
  await using ctx = factory();
  const promises = [
    ctx.client.greeting.query(),
    ctx.client.postEdit.mutate({ id: '', data: { text: '', title: '' } }),
  ] as const;

  expect(await Promise.all(promises)).toMatchInlineSnapshot(`
    Array [
      "hello world",
      Object {
        "id": "",
        "text": "",
        "title": "",
      },
    ]
  `);
});

describe('regression test - slow createContext', () => {
  test('send messages immediately on connection', async () => {
    await using t = factory({
      async createContext() {
        await waitMs(50);
        return {};
      },
    });
    const rawClient = new WebSocket(t.wssUrl);

    const msg: TRPCRequestMessage = {
      id: 1,
      method: 'query',
      params: {
        path: 'greeting',
        input: null,
      },
    };
    const msgStr = JSON.stringify(msg);
    rawClient.onopen = () => {
      rawClient.send(msgStr);
    };
    const data = await new Promise<string>((resolve) => {
      rawClient.addEventListener('message', (msg) => {
        resolve(msg.data as string);
      });
    });
    expect(JSON.parse(data)).toMatchInlineSnapshot(`
      Object {
        "id": 1,
        "result": Object {
          "data": "hello world",
          "type": "data",
        },
      }
    `);
    rawClient.close();
  });

  test('createContext throws', async () => {
    const createContext = vi.fn(async () => {
      await waitMs(20);
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'test' });
    });
    await using t = factory({
      createContext,
      wsClient: {
        lazy: {
          enabled: true,
          closeMs: 1,
        },
      },
    });
    const rawClient = new WebSocket(t.wssUrl);

    const msg: TRPCRequestMessage = {
      id: 1,
      method: 'query',
      params: {
        path: 'greeting',
        input: null,
      },
    };
    const msgStr = JSON.stringify(msg);
    rawClient.onopen = () => {
      rawClient.send(msgStr);
    };

    const responses: any[] = [];
    rawClient.addEventListener('message', (msg) => {
      responses.push(JSON.parse(msg.data as string));
    });
    await new Promise<void>((resolve) => {
      rawClient.addEventListener('close', () => {
        resolve();
      });
    });
    for (const res of responses) {
      expect(res).toHaveProperty('error');
      expect(typeof res.error.data.stack).toBe('string');
      res.error.data.stack = '[redacted]';
    }
    expect(responses).toHaveLength(2);
    const [first, second] = responses;

    expect(first.id).toBe(null);
    expect(second.id).toBe(1);

    expect(responses).toMatchInlineSnapshot(`
      Array [
        Object {
          "error": Object {
            "code": -32001,
            "data": Object {
              "code": "UNAUTHORIZED",
              "httpStatus": 401,
              "stack": "[redacted]",
            },
            "message": "test",
          },
          "id": null,
        },
        Object {
          "error": Object {
            "code": -32001,
            "data": Object {
              "code": "UNAUTHORIZED",
              "httpStatus": 401,
              "path": "greeting",
              "stack": "[redacted]",
            },
            "message": "test",
          },
          "id": 1,
        },
      ]
    `);
    expect(createContext).toHaveBeenCalledTimes(1);
  });
});

test('malformatted JSON', async () => {
  await using t = factory({
    wsClient: {
      lazy: {
        enabled: true,
        closeMs: 1,
      },
    },
  });
  const rawClient = new WebSocket(t.wssUrl);

  rawClient.onopen = () => {
    rawClient.send('not json');
  };

  const res: any = await new Promise<string>((resolve) => {
    rawClient.addEventListener('message', (msg) => {
      resolve(JSON.parse(msg.data as string));
    });
  });

  expect(res).toHaveProperty('error');
  expect(typeof res.error.data.stack).toBe('string');
  res.error.data.stack = '[redacted]';

  expect(res.id).toBe(null);

  // replace "Unexpected token "o" with aaa
  res.error.message = res.error.message.replace(
    /^Unexpected token.*/,
    'Unexpected token [... redacted b/c it is different in node 20]',
  );
  expect(res).toMatchInlineSnapshot(`
    Object {
      "error": Object {
        "code": -32700,
        "data": Object {
          "code": "PARSE_ERROR",
          "httpStatus": 400,
          "stack": "[redacted]",
        },
        "message": "Unexpected token [... redacted b/c it is different in node 20]",
      },
      "id": null,
    }
  `);
});

test('regression - badly shaped request', async () => {
  await using t = factory();
  const rawClient = new WebSocket(t.wssUrl);

  const msg: TRPCRequestMessage = {
    id: null,
    method: 'query',
    params: {
      path: 'greeting',
      input: null,
    },
  };
  const msgStr = JSON.stringify(msg);
  rawClient.onopen = () => {
    rawClient.send(msgStr);
  };
  const result = await new Promise<string>((resolve) => {
    rawClient.addEventListener('message', (msg) => {
      resolve(msg.data as string);
    });
  });
  const data = JSON.parse(result);
  data.error.data.stack = '[redacted]';

  expect(data).toMatchInlineSnapshot(`
    Object {
      "error": Object {
        "code": -32700,
        "data": Object {
          "code": "PARSE_ERROR",
          "httpStatus": 400,
          "stack": "[redacted]",
        },
        "message": "\`id\` is required",
      },
      "id": null,
    }
  `);
  rawClient.close();
});

describe('include "jsonrpc" in response if sent with message', () => {
  test('queries & mutations', async () => {
    await using t = factory();
    const rawClient = new WebSocket(t.wssUrl);

    const queryMessageWithJsonRPC: TRPCClientOutgoingMessage = {
      id: 1,
      jsonrpc: '2.0',
      method: 'query',
      params: {
        path: 'greeting',
        input: null,
      },
    };

    rawClient.onopen = () => {
      rawClient.send(JSON.stringify(queryMessageWithJsonRPC));
    };

    const queryResult = await new Promise<string>((resolve) => {
      rawClient.addEventListener('message', (msg) => {
        resolve(msg.data as string);
      });
    });

    const queryData = JSON.parse(queryResult);

    expect(queryData).toMatchInlineSnapshot(`
      Object {
        "id": 1,
        "jsonrpc": "2.0",
        "result": Object {
          "data": "hello world",
          "type": "data",
        },
      }
    `);

    const mutationMessageWithJsonRPC: TRPCClientOutgoingMessage = {
      id: 1,
      jsonrpc: '2.0',
      method: 'mutation',
      params: {
        path: 'mut',
        input: undefined,
      },
    };

    rawClient.send(JSON.stringify(mutationMessageWithJsonRPC));

    const mutationResult = await new Promise<string>((resolve) => {
      rawClient.addEventListener('message', (msg) => {
        resolve(msg.data as string);
      });
    });

    const mutationData = JSON.parse(mutationResult);

    expect(mutationData).toMatchInlineSnapshot(`
      Object {
        "id": 1,
        "jsonrpc": "2.0",
        "result": Object {
          "data": "mutation resolved",
          "type": "data",
        },
      }
    `);

    rawClient.close();
  });

  test('subscriptions', async () => {
    await using t = factory();
    const rawClient = new WebSocket(t.wssUrl);

    const subscriptionMessageWithJsonRPC: TRPCClientOutgoingMessage = {
      id: 1,
      jsonrpc: '2.0',
      method: 'subscription',
      params: {
        path: 'onMessageObservable',
        input: null,
      },
    };

    rawClient.onopen = () => {
      rawClient.send(JSON.stringify(subscriptionMessageWithJsonRPC));
    };

    const startedResult = await new Promise<string>((resolve) => {
      rawClient.addEventListener('message', (msg) => {
        resolve(msg.data as string);
      });
    });

    const startedData = JSON.parse(startedResult);

    expect(startedData).toMatchInlineSnapshot(`
      Object {
        "id": 1,
        "jsonrpc": "2.0",
        "result": Object {
          "type": "started",
        },
      }
    `);

    const messageResult = await new Promise<string>((resolve) => {
      rawClient.addEventListener('message', (msg) => {
        resolve(msg.data as string);
      });

      t.ee.emit('server:msg', { id: '1' });
    });

    const messageData = JSON.parse(messageResult);

    expect(messageData).toMatchInlineSnapshot(`
      Object {
        "id": 1,
        "jsonrpc": "2.0",
        "result": Object {
          "data": Object {
            "id": "1",
          },
          "type": "data",
        },
      }
    `);

    const subscriptionStopNotificationWithJsonRPC: TRPCClientOutgoingMessage = {
      id: 1,
      jsonrpc: '2.0',
      method: 'subscription.stop',
    };
    const stoppedResult = await new Promise<string>((resolve) => {
      rawClient.addEventListener('message', (msg) => {
        resolve(msg.data as string);
      });
      rawClient.send(JSON.stringify(subscriptionStopNotificationWithJsonRPC));
    });

    const stoppedData = JSON.parse(stoppedResult);

    expect(stoppedData).toMatchInlineSnapshot(`
      Object {
        "id": 1,
        "jsonrpc": "2.0",
        "result": Object {
          "type": "stopped",
        },
      }
    `);

    rawClient.close();
  });
});

test('wsClient stops reconnecting after .close()', async () => {
  const badWsUrl = 'ws://localhost:9999';
  const retryDelayMsMock = vi.fn<
    NonNullable<WebSocketClientOptions['retryDelayMs']>
  >(() => 100);
  const onErrorMock = vi.fn<NonNullable<WebSocketClientOptions['onError']>>();

  const wsClient = createWSClient({
    url: badWsUrl,
    retryDelayMs: retryDelayMsMock,
    onError: onErrorMock,
  });

  await vi.waitFor(() => {
    expect(retryDelayMsMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock).toHaveBeenCalledTimes(1);
  });
  await vi.waitFor(() => {
    expect(retryDelayMsMock).toHaveBeenCalledTimes(2);
    expect(onErrorMock).toHaveBeenCalledTimes(2);
  });

  wsClient.close();
  await waitMs(100);

  expect(retryDelayMsMock).toHaveBeenCalledTimes(2);
  expect(onErrorMock).toHaveBeenCalledTimes(2);
});
test('connection state settles on idle after .close()', async () => {
  await using ctx = factory();

  await vi.waitFor(() => {
    expect(ctx.connectionState.mock.calls.map((c) => c[0]?.state)).toContain(
      'pending',
    );
  });

  await ctx.wsClient.close();
  await vi.waitFor(() => {
    expect(ctx.onCloseMock).toHaveBeenCalled();
  });

  const states = ctx.connectionState.mock.calls.map((c) => c[0]?.state);
  expect(states.at(-1)).toBe('idle');
});

describe('lazy mode', () => {
  test('happy path', async () => {
    await using ctx = factory({
      wsClient: {
        lazy: {
          enabled: true,
          closeMs: 1,
        },
      },
    });
    expect(ctx.wsClient.connection).toBe(null);

    // --- do some queries and wait for the client to disconnect
    {
      const res = await Promise.all([
        ctx.client.greeting.query('query 1'),
        ctx.client.greeting.query('query 2'),
      ]);
      expect(res).toMatchInlineSnapshot(`
        Array [
          "hello query 1",
          "hello query 2",
        ]
      `);
      expect(ctx.wsClient.connection).not.toBe(null);

      await vi.waitFor(() => {
        expect(ctx.onOpenMock).toHaveBeenCalledTimes(1);
        expect(ctx.onCloseMock).toHaveBeenCalledTimes(1);
      });
      expect(ctx.wsClient.connection).toBe(null);
    }
    {
      // --- do some more queries and wait for the client to disconnect again
      const res = await Promise.all([
        ctx.client.greeting.query('query 3'),
        ctx.client.greeting.query('query 4'),
      ]);
      expect(res).toMatchInlineSnapshot(`
        Array [
          "hello query 3",
          "hello query 4",
        ]
      `);

      await vi.waitFor(() => {
        expect(ctx.onCloseMock).toHaveBeenCalledTimes(2);
        expect(ctx.onOpenMock).toHaveBeenCalledTimes(2);
      });
    }

    expect(ctx.connectionState.mock.calls.map((it) => it[0]?.state))
      .toMatchInlineSnapshot(`
      Array [
        "idle",
        "connecting",
        "pending",
        "idle",
        "connecting",
        "pending",
        "idle",
      ]
    `);
  });
  test('subscription', async () => {
    await using ctx = factory({
      wsClient: {
        lazy: {
          enabled: true,
          closeMs: 1,
        },
      },
    });

    // --- do a subscription, check that we connect
    const onDataMock = vi.fn();

    expect(ctx.wsClient.connection).toBe(null);
    const sub = ctx.client.onMessageObservable.subscribe(undefined, {
      onData: onDataMock,
    });

    expect(ctx.onOpenMock).toHaveBeenCalledTimes(0);
    await vi.waitFor(() => {
      expect(ctx.wsClient.connection).not.toBe(null);
    });
    expect(ctx.onOpenMock).toHaveBeenCalledTimes(1);

    // emit a message, check that we receive it
    ctx.ee.emit('server:msg', {
      id: '1',
    });
    await vi.waitFor(() => expect(onDataMock).toHaveBeenCalledTimes(1));
    expect(onDataMock.mock.calls).toMatchInlineSnapshot(`
      Array [
        Array [
          Object {
            "id": "1",
          },
        ],
      ]
    `);

    // close subscription, check that we disconnect
    sub.unsubscribe();

    await vi.waitFor(() => {
      expect(ctx.onCloseMock).toHaveBeenCalledTimes(1);
    });

    expect(ctx.wsClient.connection).toBe(null);
  });

  test('reconnects a lazy websocket if there is an active subscription when the websocket is closed', async () => {
    await using ctx = factory({
      wsClient: {
        lazy: {
          enabled: true,
          closeMs: 0,
        },
      },
    });

    const onDataMock = vi.fn();

    expect(ctx.wsClient.connection).toBe(null);

    // Start a subscription
    const subscription = ctx.client.onMessageObservable.subscribe(undefined, {
      onData: onDataMock,
    });

    await vi.waitFor(() => {
      expect(ctx.wsClient.connection).not.toBe(null);
    });
    expect(ctx.onOpenMock).toHaveBeenCalledTimes(1);

    // emit a message, check that we receive it
    ctx.ee.emit('server:msg', {
      id: '1',
    });

    await vi.waitFor(() =>
      expect(onDataMock).toHaveBeenCalledWith({
        id: '1',
      }),
    );

    ctx.destroyConnections();

    await vi.waitFor(() => {
      expect(ctx.onCloseMock).toHaveBeenCalledTimes(1);
    });

    expect(ctx.wsClient.connection).toBe(null);

    // Verify the reconnection happens because there was an active subscription
    await vi.waitFor(() => {
      expect(ctx.wsClient.connection).not.toBe(null);
    });

    expect(ctx.onOpenMock).toHaveBeenCalled();

    // verify we can still receive messages after reconnection
    ctx.ee.emit('server:msg', {
      id: '2',
    });

    await vi.waitFor(() =>
      expect(onDataMock).toHaveBeenCalledWith({ id: '2' }),
    );

    subscription.unsubscribe();
  });

  // https://github.com/trpc/trpc/pull/5152
  test('race condition on dispatching / instant close', async () => {
    await using ctx = factory({
      wsClient: {
        lazy: {
          enabled: true,
          closeMs: 0,
        },
      },
    });
    expect(ctx.wsClient.connection).toBe(null);

    // --- do some queries and wait for the client to disconnect
    {
      const res = await ctx.client.greeting.query('query 1');
      expect(res).toMatchInlineSnapshot('"hello query 1"');

      await vi.waitFor(() => {
        expect(ctx.onOpenMock).toHaveBeenCalledTimes(1);
        expect(ctx.onCloseMock).toHaveBeenCalledTimes(1);
      });
      expect(ctx.wsClient.connection).toBe(null);
    }

    {
      // --- do some more queries and wait for the client to disconnect again
      const res = await Promise.all([
        ctx.client.greeting.query('query 3'),
        ctx.client.greeting.query('query 4'),
      ]);
      expect(res).toMatchInlineSnapshot(`
        Array [
          "hello query 3",
          "hello query 4",
        ]
      `);

      await vi.waitFor(() => {
        expect(ctx.onCloseMock).toHaveBeenCalledTimes(2);
        expect(ctx.onOpenMock).toHaveBeenCalledTimes(2);
      });
    }
  });
});

describe('lastEventId', () => {
  test('lastEventId', async () => {
    await using ctx = factory({
      wsClient: {},
    });

    const onData = vi.fn<(val: { id: string; data: Message }) => void>();

    const onStarted = vi.fn();
    const sub = ctx.client.iterable.subscribe(undefined, {
      onStarted,
      onData(data) {
        // console.log('data', data);
        onData(data);
      },
    });

    {
      // connect and wait for the first message

      await vi.waitFor(() => {
        expect(onStarted).toHaveBeenCalledTimes(1);
      });
      ctx.nextIterable();
      await vi.waitFor(() => {
        expect(onData).toHaveBeenCalledTimes(1);
      });
      expect(onData.mock.calls[0]![0]).toEqual({
        id: '1',
        data: {
          id: '1',
          title: 'hello 1',
        },
      });
    }
    {
      // disconnect and wait for the next message
      ctx.destroyConnections();

      await vi.waitFor(() => {
        expect(onStarted).toHaveBeenCalledTimes(2);
      });
      ctx.nextIterable();

      await vi.waitFor(() => {
        expect(onData).toHaveBeenCalledTimes(2);
      });

      // Expect the next message to be the second one
      expect(onData.mock.calls[1]![0]).toEqual({
        id: '2',
        data: {
          id: '2',
          title: 'hello 2',
        },
      });
    }

    sub.unsubscribe();
  });
});

describe('keep alive on the server', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });
  afterAll(() => {
    vi.useRealTimers();
  });
  function attachPongMock(wss: WebSocket.Server) {
    const onPong = vi.fn();

    wss.on('connection', (ws) => {
      ws.on('message', (raw) => {
        // oxlint-disable-next-line typescript/no-base-to-string
        if (raw.toString() === 'PONG') {
          onPong();
        }
      });
    });

    return onPong;
  }
  test('pong message should be received', async () => {
    const pingMs = 2_000;
    const pongWaitMs = 5_000;
    await using ctx = factory({
      wssServer: {
        keepAlive: {
          enabled: true,
          pingMs,
          pongWaitMs,
        },
      },
    });

    const onPong = attachPongMock(ctx.wss);

    await new Promise((resolve) => {
      ctx.wss.on('connection', resolve);
    });

    {
      await vi.advanceTimersByTimeAsync(pingMs);
      await vi.advanceTimersByTimeAsync(pongWaitMs);
      await vi.advanceTimersByTimeAsync(100);

      expect(ctx.wsClient.connection).not.toBe(null);
      expect(onPong).toHaveBeenCalled();
    }
  });
  test('no pong message should be received', async () => {
    await using ctx = factory({});

    await new Promise((resolve) => {
      ctx.wss.on('connection', resolve);
    });

    const onPong = attachPongMock(ctx.wss);
    {
      await vi.advanceTimersByTimeAsync(60_000);
      expect(ctx.wsClient.connection).not.toBe(null);
      expect(onPong).not.toHaveBeenCalled();
    }
  });
});

describe('keep alive from the client', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  test('pong message should be received', async () => {
    const intervalMs = 2_000;
    const pongTimeoutMs = 5_000;
    const onClose = vi.fn();
    await using ctx = factory({
      wssServer: {
        dangerouslyDisablePong: false,
        keepAlive: {
          enabled: false,
        },
      },
      wsClient: {
        lazy: {
          enabled: false,
          closeMs: 0,
        },
        keepAlive: {
          enabled: true,
          intervalMs,
          pongTimeoutMs,
        },
        onClose,
      },
    });

    await vi.advanceTimersByTimeAsync(1);
    await new Promise((resolve) => {
      ctx.wsClient.connection!.ws.addEventListener('open', resolve);
    });

    let pong = false;
    ctx.wsClient.connection!.ws.addEventListener('message', (msg) => {
      if (msg.data == 'PONG') {
        pong = true;
      }
    });

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(intervalMs);
    await vi.advanceTimersByTimeAsync(pongTimeoutMs);

    expect(pong).toBe(true);
  });

  test('should close if no pong is received', async () => {
    const intervalMs = 2_000;
    const pongTimeoutMs = 5_000;
    const onClose = vi.fn();
    await using ctx = factory({
      wssServer: {
        dangerouslyDisablePong: true,
        keepAlive: {
          enabled: false,
        },
      },
      wsClient: {
        lazy: {
          enabled: false,
          closeMs: 0,
        },
        keepAlive: {
          enabled: true,
          intervalMs,
          pongTimeoutMs,
        },
        onClose,
      },
    });

    await vi.advanceTimersByTimeAsync(1);
    await new Promise((resolve) => {
      ctx.wsClient.connection!.ws.addEventListener('open', resolve);
    });

    let pong = false;
    ctx.wsClient.connection!.ws.addEventListener('message', (msg) => {
      if (msg.data === 'PONG') {
        pong = true;
      }
    });

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(intervalMs);
    await vi.advanceTimersByTimeAsync(pongTimeoutMs);

    expect(pong).toBe(false);

    vi.useRealTimers();
    await vi.waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
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

  const appRouter = t.router({
    whoami: t.procedure.query((opts) => {
      return opts.ctx.user;
    }),
    iterable: t.procedure.subscription(async function* () {
      await new Promise((_resolve) => {
        // Intentionally never resolve to keep subscription active
      });
      yield null;
    }),
  });

  type AppRouter = typeof appRouter;

  const authOptions = {
    wssServer: {
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
  } satisfies TRPCServerResourceOpts<AppRouter>;

  test('do a call without auth', async () => {
    await using ctx = testServerAndClientResource(appRouter, authOptions);
    const wsClient = createWSClient({
      url: ctx.wssUrl,
    });
    const client = createTRPCClient<AppRouter>({
      links: [
        wsLink({
          client: wsClient,
        }),
      ],
    });
    const result = await client.whoami.query();

    expect(result).toBe(null);
  });

  test('with auth', async () => {
    await using ctx = testServerAndClientResource(appRouter, authOptions);
    const wsClient = createWSClient({
      url: ctx.wssUrl,
      connectionParams: async () => {
        return {
          token: USER_TOKEN,
        };
      },
      lazy: {
        enabled: true,
        closeMs: 0,
      },
    });
    const client = createTRPCClient<AppRouter>({
      links: [
        wsLink({
          client: wsClient,
        }),
      ],
    });
    const result = await client.whoami.query();

    expect(result).toEqual(USER_MOCK);
  });

  test('with async auth', async () => {
    await using ctx = testServerAndClientResource(appRouter, authOptions);
    const wsClient = createWSClient({
      url: ctx.wssUrl,
      connectionParams: async () => {
        await sleep(500);
        return {
          token: USER_TOKEN,
        };
      },
    });
    const client = createTRPCClient<AppRouter>({
      links: [
        wsLink({
          client: wsClient,
        }),
      ],
    });
    const result = await client.whoami.query();

    expect(result).toEqual(USER_MOCK);
  });

  test('reconnect with async auth and pending subscriptions', async () => {
    await using ctx = testServerAndClientResource(appRouter, authOptions);
    const onConnectionOpen = vi.fn();
    const onSubscriptionStarted = vi.fn();

    const wsClient = createWSClient({
      url: ctx.wssUrl,
      connectionParams: async () => {
        await sleep(500);
        return {
          token: USER_TOKEN,
        };
      },
      onOpen: onConnectionOpen,
    });
    const client = createTRPCClient<AppRouter>({
      links: [
        wsLink({
          client: wsClient,
        }),
      ],
    });
    client.iterable.subscribe(undefined, {
      onStarted: onSubscriptionStarted,
    });
    await vi.waitFor(() => {
      expect(onConnectionOpen).toHaveBeenCalledTimes(1);
      expect(onSubscriptionStarted).toHaveBeenCalledTimes(1);
    });

    ctx.wssHandler.broadcastReconnectNotification();

    await vi.waitFor(() => {
      expect(onConnectionOpen).toHaveBeenCalledTimes(2);
      expect(onSubscriptionStarted).toHaveBeenCalledTimes(1);
    });
    // The old socket serves the subscription until connectionParams are sent
    // on the new one.
    await vi.waitFor(() => {
      expect(ctx.wss.clients.size).toBe(1);
    });
    expect(onSubscriptionStarted).toHaveBeenCalledTimes(1);
  });

  test('regression: bad connection params', async () => {
    await using ctx = testServerAndClientResource(appRouter, authOptions);
    async function connect() {
      const ws = new WebSocket(ctx.wssUrl + '?connectionParams=1');
      await new Promise((resolve) => {
        ws.addEventListener('open', resolve);
      });
      function request(str: string) {
        ws.send(str);
        return new Promise<Res>((resolve, reject) => {
          ws.addEventListener('message', (it) => {
            resolve(JSON.parse(it.data as string));
          });
          ws.addEventListener('error', reject);
          ws.addEventListener('close', reject);
        });
      }
      return { request };
    }

    type Res = TRPCResponse<unknown, DefaultErrorShape>;

    const badConnectionParams = JSON.stringify({
      method: 'connectionParams',
      data: { invalidConnectionParams: null },
    });

    {
      const client = await connect();
      const res = await client.request(badConnectionParams);

      assert('error' in res);
      expect(res.error.message).toMatchInlineSnapshot(
        `"Invalid connection params shape"`,
      );
    }

    {
      const client = await connect();
      const res = await client.request(badConnectionParams);

      assert('error' in res);
      expect(res.error.message).toMatchInlineSnapshot(
        `"Invalid connection params shape"`,
      );
    }
  });
});

describe('subscriptions with createCaller', () => {
  test('iterable', async () => {
    await using ctx = factory();

    expectTypeOf(ctx.router.onMessageIterable).toEqualTypeOf<
      SubscriptionProcedure<{
        input: string | null | undefined;
        output: AsyncIterable<Message, void, any>;
        meta: object;
        errorShape: DefaultErrorShape;
      }>
    >();
    const abortController = new AbortController();
    const caller = ctx.router.createCaller(
      {},
      {
        signal: abortController.signal,
      },
    );
    const result = await caller.onMessageIterable();
    expectTypeOf(result).toMatchTypeOf<AsyncIterable<Message>>();

    const msgs: Message[] = [];
    const onDone = vi.fn();
    const onError = vi.fn();

    run(async () => {
      for await (const msg of result) {
        msgs.push(msg);
      }
      onDone();
    }).catch(onError);

    ctx.ee.emit('server:msg', {
      id: '1',
    });
    ctx.ee.emit('server:msg', {
      id: '2',
    });

    await vi.waitFor(() => {
      expect(msgs).toHaveLength(2);
    });

    abortController.abort();

    await vi.waitFor(() => {
      expect(ctx.ee.listenerCount('server:msg')).toBe(0);
    });
    await vi.waitFor(() => {
      expect(onDone).toHaveBeenCalledTimes(0);
      expect(onError).toHaveBeenCalledTimes(1);
    });
    expect(onError.mock.calls[0]).toMatchInlineSnapshot(`
      Array [
        [AbortError: The operation was aborted],
      ]
    `);
  });

  test('observable', async () => {
    await using ctx = factory();

    expectTypeOf(ctx.router.onMessageObservable).toEqualTypeOf<
      LegacyObservableSubscriptionProcedure<{
        input: string | null | undefined;
        output: Message;
        meta: object;
        errorShape: DefaultErrorShape;
      }>
    >();

    const abortController = new AbortController();
    const caller = ctx.router.createCaller(
      {},
      {
        signal: abortController.signal,
      },
    );
    const obs = await caller.onMessageObservable();
    expectTypeOf(obs).toMatchTypeOf<Observable<Message, TRPCError>>();

    const msgs: Message[] = [];
    const onDone = vi.fn();
    const onError = vi.fn();

    const sub = obs.subscribe({
      next(msg) {
        msgs.push(msg);
      },
      error: onError,
      complete: onDone,
    });
    abortController.signal.addEventListener('abort', () => {
      sub.unsubscribe();
    });
    ctx.ee.emit('server:msg', {
      id: '1',
    });
    ctx.ee.emit('server:msg', {
      id: '2',
    });

    await vi.waitFor(() => {
      expect(msgs).toHaveLength(2);
    });

    abortController.abort();

    await vi.waitFor(() => {
      expect(ctx.ee.listenerCount('server:msg')).toBe(0);
      expect(ctx.subscriptionEnded).toHaveBeenCalledTimes(1);
    });
  });
});

test('url callback and connection params is invoked for every reconnect', async () => {
  await using ctx = factory({
    wsClient: {
      lazy: {
        enabled: true,
        closeMs: 0,
      },
    },
  });

  let urlCalls = 0;
  let connectionParamsCalls = 0;
  const client = createWSClient({
    url: () => {
      urlCalls++;
      return ctx.wssUrl;
    },
    connectionParams() {
      connectionParamsCalls++;
      return {};
    },
  });

  async function waitForClientState<
    T extends TRPCConnectionState<unknown>['state'],
  >(state: T) {
    for await (const res of observableToAsyncIterable(
      client.connectionState,
      new AbortController().signal,
    )) {
      if (res.state === state) {
        return res as Extract<typeof res, { state: T }>;
      }
    }
    throw new Error();
  }

  await waitForClientState('pending');
  expect(urlCalls).toBe(1);
  expect(connectionParamsCalls).toBe(1);

  // destroy connections to force a reconnect
  ctx.destroyConnections();

  // it'll be connecting with an error
  const state = await waitForClientState('connecting');
  expect(state.error).toMatchInlineSnapshot(
    `[TRPCClientError: WebSocket closed]`,
  );

  // it'll reconnect and be pending
  await waitForClientState('pending');

  expect(urlCalls).toBe(2);
  expect(connectionParamsCalls).toBe(2);
});

test('active subscription while querying', async () => {
  await using ctx = factory();
  const onStartedMock = vi.fn();
  const onDataMock = vi.fn();

  const subscription = ctx.client.onMessageIterable.subscribe(undefined, {
    onStarted() {
      onStartedMock();
    },
    onData(data) {
      expectTypeOf(data).not.toBeAny();
      expectTypeOf(data).toMatchTypeOf<Message>();
      onDataMock(data);
    },
  });

  await vi.waitFor(() => {
    expect(onStartedMock).toHaveBeenCalledTimes(1);
  });

  ctx.ee.emit('server:msg', {
    id: '1',
  });

  await vi.waitFor(() => {
    expect(onDataMock).toHaveBeenCalledTimes(1);
  });

  // ensure we can do a query while having an active subscription
  const result = await ctx.client.greeting.query('hello');
  expect(result).toMatchInlineSnapshot(`"hello hello"`);

  ctx.ee.emit('server:msg', {
    id: '2',
  });

  await vi.waitFor(() => {
    expect(onDataMock).toHaveBeenCalledTimes(2);
  });

  // Make sure it didn't reconnect or whatever
  expect(onStartedMock).toHaveBeenCalledTimes(1);

  subscription.unsubscribe();

  await vi.waitFor(() => {
    expect(ctx.ee.listenerCount('server:msg')).toBe(0);
    expect(ctx.ee.listenerCount('server:error')).toBe(0);
  });
});

test('lazy connection where the first connection fails', async () => {
  await using ctx = factory({
    wsClient: {
      lazy: {
        enabled: true,
        closeMs: 0,
      },
    },
  });
  const onStartedMock = vi.fn();
  const onDataMock = vi.fn();

  // Close the server before
  await ctx.close();
  const subscription = ctx.client.onMessageIterable.subscribe(undefined, {
    onStarted() {
      onStartedMock();
    },
    onData(data) {
      expectTypeOf(data).not.toBeAny();
      expectTypeOf(data).toMatchTypeOf<Message>();
      onDataMock(data);
    },
  });

  // Wait for the first connection to fail
  await new Promise<void>((resolve) => {
    const sub = ctx.wsClient.connectionState.subscribe({
      next(state) {
        if (state.state === 'connecting' && state.error) {
          resolve();
          sub.unsubscribe();
        }
      },
    });
  });

  ctx.open();

  await vi.waitFor(() => {
    expect(onStartedMock).toHaveBeenCalledTimes(1);
  });

  ctx.ee.emit('server:msg', {
    id: '1',
  });

  await vi.waitFor(() => {
    expect(onDataMock).toHaveBeenCalledTimes(1);
  });

  subscription.unsubscribe();
});

test('connection where the first connection fails', async () => {
  await using ctx = factory();
  const onStartedMock = vi.fn();
  const onDataMock = vi.fn();

  // Close the server before the client has a chance to connect
  await ctx.close();

  const subscription = ctx.client.onMessageIterable.subscribe(undefined, {
    onStarted() {
      onStartedMock();
    },
    onData(data) {
      expectTypeOf(data).not.toBeAny();
      expectTypeOf(data).toMatchTypeOf<Message>();
      onDataMock(data);
    },
  });

  // Wait for the first connection to fail
  await new Promise<void>((resolve) => {
    const sub = ctx.wsClient.connectionState.subscribe({
      next(state) {
        if (state.state === 'connecting' && state.error) {
          resolve();
          sub.unsubscribe();
        }
      },
    });
  });

  ctx.open();

  await vi.waitFor(() => {
    expect(onStartedMock).toHaveBeenCalledTimes(1);
  });

  ctx.ee.emit('server:msg', {
    id: '1',
  });

  await vi.waitFor(() => {
    expect(onDataMock).toHaveBeenCalledTimes(1);
  });

  subscription.unsubscribe();
});

// https://github.com/trpc/trpc/issues/6962
test('connection state should not be updated for subscriptions', async () => {
  await using ctx = factory();

  // Wait for the websocket connection to be established
  await new Promise<void>((resolve) => {
    const sub = ctx.wsClient.connectionState.subscribe({
      next(state) {
        if (state.state === 'pending') {
          sub.unsubscribe();
          resolve();
        }
      },
    });
  });

  // Create a subscription that will be closed by the server after some time
  const onStarted = vi.fn();
  const onData = vi.fn();
  const onComplete = vi.fn();
  const onConnectionStateChange = vi.fn();

  expect(ctx.wsClient.connectionState.get().state).toBe('pending');

  const subscription = ctx.client.onMessageObservable.subscribe(undefined, {
    onStarted,
    onData,
    onComplete,
    onConnectionStateChange,
  });

  expect(ctx.wsClient.connectionState.get().state).toBe('pending');

  // Wait for subscription to start
  await vi.waitFor(() => {
    expect(onStarted).toHaveBeenCalledTimes(1);
  });

  // Emit some data to the subscription
  ctx.ee.emit('server:msg', {
    id: '1',
  });

  await vi.waitFor(() => {
    expect(onData).toHaveBeenCalledTimes(1);
  });

  // The onConnectionStateChange should only be called with 'pending' state
  // since the connection is already established when the subscription starts
  expect(onConnectionStateChange.mock.calls.map((c) => c[0]?.state)).toEqual([
    'pending',
  ]);

  // Clean up
  subscription.unsubscribe();
});
