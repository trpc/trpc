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
import { observable, observableToAsyncIterable } from '@trpc/server/observable';
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
      onStarted: onStartedMock(),
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
      onStarted: onStartedMock(),
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
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
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
    expect(ctx.wss.clients.size).toBe(1);
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
