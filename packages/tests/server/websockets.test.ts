import { EventEmitter, on } from 'node:events';
import { routerToServerAndClientNew, waitMs } from './___testHelpers';
import { waitFor } from '@testing-library/react';
import type { TRPCClientError, WebSocketClientOptions } from '@trpc/client';
import { createTRPCClient, createWSClient, wsLink } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';
import { initTRPC, sse, tracked, TRPCError } from '@trpc/server';
import type { WSSHandlerOptions } from '@trpc/server/adapters/ws';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import type { Observer } from '@trpc/server/observable';
import { observable } from '@trpc/server/observable';
import type {
  TRPCClientOutgoingMessage,
  TRPCRequestMessage,
} from '@trpc/server/rpc';
import { createDeferred } from '@trpc/server/unstable-core-do-not-import';
import { konn } from 'konn';
import WebSocket, { Server } from 'ws';
import { z } from 'zod';

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
  const onNewClient = vi.fn();
  const onSlowMutationCalled = vi.fn();

  const t = initTRPC.create();

  let iterableDeferred = createDeferred<void>();
  const nextIterable = () => {
    iterableDeferred.resolve();
    iterableDeferred = createDeferred();
  };

  const appRouter = t.router({
    greeting: t.procedure.input(z.string().nullish()).query(({ input }) => {
      return `hello ${input ?? 'world'}`;
    }),

    slow: t.procedure.mutation(async ({}) => {
      onSlowMutationCalled();
      await waitMs(50);
      return 'slow query resolved';
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
      .subscription(({}) => {
        const sub = observable<Message>((emit) => {
          subRef.current = emit;
          const onMessage = (data: Message) => {
            emit.next(data);
          };
          ee.on('server:msg', onMessage);
          return () => {
            subscriptionEnded();
            ee.off('server:msg', onMessage);
          };
        });
        ee.emit('subscription:created');
        onNewMessageSubscription();
        return sub;
      }),

    onMessageIterable: t.procedure
      .input(z.string().nullish())
      .subscription(async function* () {
        ee.emit('subscription:created');
        onNewMessageSubscription();

        for await (const data of on(ee, 'server:msg')) {
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

  const opts = routerToServerAndClientNew(appRouter, {
    wsClient: {
      retryDelayMs: () => 10,
      onOpen: onOpenMock,
      onError: onErrorMock,
      onClose: onCloseMock,
      ...config?.wsClient,
    },
    client({ wsClient }) {
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

  opts.wss.addListener('connection', onNewClient);
  return {
    ...opts,
    ee,
    subRef,
    onNewMessageSubscription,
    onNewClient,
    onOpenMock,
    onErrorMock,
    onCloseMock,
    onSlowMutationCalled,
    nextIterable,
  };
}

test('query', async () => {
  const { client: client, close } = factory();
  expect(await client.greeting.query()).toBe('hello world');
  expect(await client.greeting.query(null)).toBe('hello world');
  expect(await client.greeting.query('alexdotjs')).toBe('hello alexdotjs');

  await close();
});

test('mutation', async () => {
  const { client, close } = factory();
  expect(
    await client.postEdit.mutate({
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

  await close();
});

test('basic subscription test (observable)', async () => {
  const { client, close, ee } = factory();
  ee.once('subscription:created', () => {
    setTimeout(() => {
      ee.emit('server:msg', {
        id: '1',
      });
      ee.emit('server:msg', {
        id: '2',
      });
    });
  });
  const onStartedMock = vi.fn();
  const onDataMock = vi.fn();
  const subscription = client.onMessageObservable.subscribe(undefined, {
    onStarted() {
      onStartedMock();
    },
    onData(data) {
      expectTypeOf(data).not.toBeAny();
      expectTypeOf(data).toMatchTypeOf<Message>();
      onDataMock(data);
    },
  });

  await waitFor(() => {
    expect(onStartedMock).toHaveBeenCalledTimes(1);
    expect(onDataMock).toHaveBeenCalledTimes(2);
  });

  ee.emit('server:msg', {
    id: '2',
  });
  await waitFor(() => {
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

  await waitFor(() => {
    expect(ee.listenerCount('server:msg')).toBe(0);
    expect(ee.listenerCount('server:error')).toBe(0);
  });
  await close();
});

test('basic subscription test (iterator)', async () => {
  const { client, close, ee } = factory();
  ee.once('subscription:created', () => {
    setTimeout(() => {
      ee.emit('server:msg', {
        id: '1',
      });
      ee.emit('server:msg', {
        id: '2',
      });
    });
  });
  const onStartedMock = vi.fn();
  const onDataMock = vi.fn();
  const subscription = client.onMessageIterable.subscribe(undefined, {
    onStarted() {
      onStartedMock();
    },
    onData(data) {
      expectTypeOf(data).not.toBeAny();
      expectTypeOf(data).toMatchTypeOf<Message>();
      onDataMock(data);
    },
  });

  await waitFor(() => {
    expect(onStartedMock).toHaveBeenCalledTimes(1);
    expect(onDataMock).toHaveBeenCalledTimes(2);
  });

  ee.emit('server:msg', {
    id: '2',
  });
  await waitFor(() => {
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

  // iterator won't return until the *next* message is emitted
  await waitMs(20);
  ee.emit('server:msg', {
    id: '4',
  });
  await waitFor(() => {
    expect(ee.listenerCount('server:msg')).toBe(0);
    expect(ee.listenerCount('server:error')).toBe(0);
  });
  await close();
});

test('$subscription() - client resumes subscriptions after reconnecting', async () => {
  const ctx = factory();
  const { client, close, ee } = ctx;
  ee.once('subscription:created', () => {
    setTimeout(() => {
      ee.emit('server:msg', {
        id: '1',
      });
      ee.emit('server:msg', {
        id: '2',
      });
    });
  });
  const onStartedMock = vi.fn();
  const onDataMock = vi.fn();
  const onErrorMock = vi.fn();
  const onCompleteMock = vi.fn();
  client.onMessageObservable.subscribe(undefined, {
    onStarted: onStartedMock,
    onData: onDataMock,
    onError: onErrorMock,
    onComplete: onCompleteMock,
  });

  await waitFor(() => {
    expect(onStartedMock).toHaveBeenCalledTimes(1);
    expect(onDataMock).toHaveBeenCalledTimes(2);
  });

  // kill all connections to the server (simulates restart)
  ctx.destroyConnections();

  // start a new wss server on same port, and trigger a message
  onStartedMock.mockClear();
  onDataMock.mockClear();
  onCompleteMock.mockClear();

  ee.once('subscription:created', () => {
    setTimeout(() => {
      ee.emit('server:msg', {
        id: '3',
      });
    }, 1);
  });

  await waitFor(() => {
    expect(onDataMock).toHaveBeenCalledTimes(1);
  });
  expect(onDataMock.mock.calls.map((args) => args[0])).toMatchInlineSnapshot(`
    Array [
      Object {
        "id": "3",
      },
    ]
  `);

  await ctx.close();
});

test('server subscription ended', async () => {
  const { client, close, ee, subRef } = factory();
  ee.once('subscription:created', () => {
    setTimeout(() => {
      ee.emit('server:msg', {
        id: '1',
      });
      ee.emit('server:msg', {
        id: '2',
      });
    });
  });
  const onStartedMock = vi.fn();
  const onDataMock = vi.fn();
  const onErrorMock = vi.fn();
  const onCompleteMock = vi.fn();
  client.onMessageObservable.subscribe(undefined, {
    onStarted: onStartedMock,
    onData: onDataMock,
    onError: onErrorMock,
    onComplete: onCompleteMock,
  });

  await waitFor(() => {
    expect(onStartedMock).toHaveBeenCalledTimes(1);
    expect(onDataMock).toHaveBeenCalledTimes(2);
  });
  // destroy server subscription (called by server)
  subRef.current.complete();
  await waitFor(() => {
    expect(onCompleteMock).toHaveBeenCalledTimes(1);
  });
  await close();
});

test('can close wsClient when subscribed', async () => {
  const {
    client,
    close,
    onCloseMock: wsClientOnCloseMock,
    wsClient,
    wss,
  } = factory();
  const serversideWsOnCloseMock = vi.fn();
  wss.addListener('connection', (ws) =>
    ws.on('close', serversideWsOnCloseMock),
  );

  const onStartedMock = vi.fn();
  const onDataMock = vi.fn();
  const onErrorMock = vi.fn();
  const onCompleteMock = vi.fn();
  client.onMessageObservable.subscribe(undefined, {
    onStarted: onStartedMock,
    onData: onDataMock,
    onError: onErrorMock,
    onComplete: onCompleteMock,
  });

  await waitFor(() => {
    expect(onStartedMock).toHaveBeenCalledTimes(1);
  });

  wsClient.close();

  await waitFor(() => {
    expect(onCompleteMock).toHaveBeenCalledTimes(1);
    expect(wsClientOnCloseMock).toHaveBeenCalledTimes(1);
    expect(serversideWsOnCloseMock).toHaveBeenCalledTimes(1);
  });

  await close();
});

test('sub emits errors', async () => {
  const { client, close, wss, ee, subRef } = factory();

  ee.once('subscription:created', () => {
    setTimeout(() => {
      ee.emit('server:msg', {
        id: '1',
      });
      subRef.current.error(new Error('test'));
    });
  });
  const onNewClient = vi.fn();
  wss.addListener('connection', onNewClient);
  const onStartedMock = vi.fn();
  const onDataMock = vi.fn();
  const onErrorMock = vi.fn();
  const onCompleteMock = vi.fn();
  client.onMessageObservable.subscribe(undefined, {
    onStarted: onStartedMock,
    onData: onDataMock,
    onError: onErrorMock,
    onComplete: onCompleteMock,
  });

  await waitFor(() => {
    expect(onStartedMock).toHaveBeenCalledTimes(1);
    expect(onDataMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock).toHaveBeenCalledTimes(1);
    expect(onCompleteMock).toHaveBeenCalledTimes(0);
  });

  await close();
});

test('wait for slow queries/mutations before disconnecting', async () => {
  const { client, close, wsClient, onNewClient, onSlowMutationCalled } =
    factory();

  await waitFor(() => {
    expect(onNewClient).toHaveBeenCalledTimes(1);
  });
  const promise = client.slow.mutate();
  await waitFor(() => {
    expect(onSlowMutationCalled).toHaveBeenCalledTimes(1);
  });
  const conn = wsClient.connection!;
  wsClient.close();
  expect(await promise).toMatchInlineSnapshot(`"slow query resolved"`);

  await waitFor(() => {
    expect(conn.ws!.readyState).toBe(WebSocket.CLOSED);
  });
  await close();
});

test('requests get aborted if called before connection is established and requests dispatched', async () => {
  const { client, close, wsClient, onNewClient } = factory();

  await waitFor(() => {
    expect(onNewClient).toHaveBeenCalledTimes(1);
  });
  const promise = client.slow.mutate();
  const conn = wsClient.connection;
  wsClient.close();
  await expect(promise).rejects.toMatchInlineSnapshot(
    '[TRPCClientError: Closed before connection was established]',
  );
  await close();
  await waitFor(() => {
    expect(conn!.ws!.readyState).toBe(WebSocket.CLOSED);
  });
  await close();
});

test('subscriptions are automatically resumed upon explicit reconnect request', async () => {
  const { client, close, ee, wssHandler, wss, onOpenMock, onCloseMock } =
    factory();
  ee.once('subscription:created', () => {
    setTimeout(() => {
      ee.emit('server:msg', {
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
    const unsub = client.onMessageObservable.subscribe(undefined, {
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

  await waitFor(() => {
    expect(sub1.onStartedMock).toHaveBeenCalledTimes(1);
    expect(sub1.onDataMock).toHaveBeenCalledTimes(1);
    expect(onOpenMock).toHaveBeenCalledTimes(1);
    expect(onCloseMock).toHaveBeenCalledTimes(0);
  });
  wssHandler.broadcastReconnectNotification();
  await waitFor(() => {
    expect(wss.clients.size).toBe(1);
    expect(onOpenMock).toHaveBeenCalledTimes(2);
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  await waitFor(() => {
    expect(sub1.onStartedMock).toHaveBeenCalledTimes(1);
    expect(sub1.onDataMock).toHaveBeenCalledTimes(1);
  });
  ee.emit('server:msg', {
    id: '2',
  });

  await waitFor(() => {
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
  await waitFor(() => {
    expect(wss.clients.size).toBe(1);
  });

  await close();

  await waitFor(() => {
    expect(onCloseMock).toHaveBeenCalledTimes(2);
  });
});

test('subscriptions are automatically resumed if connection is lost', async () => {
  const { client, close, ee, wssHandler, wss, onOpenMock, onCloseMock } =
    factory();
  ee.once('subscription:created', () => {
    setTimeout(() => {
      ee.emit('server:msg', {
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
    const unsub = client.onMessageObservable.subscribe(undefined, {
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

  await waitFor(() => {
    expect(sub1.onStartedMock).toHaveBeenCalledTimes(1);
    expect(sub1.onDataMock).toHaveBeenCalledTimes(1);
    expect(onOpenMock).toHaveBeenCalledTimes(1);
    expect(onCloseMock).toHaveBeenCalledTimes(0);
  });
  // close connections forcefully
  wss.clients.forEach((ws) => ws.close());
  await waitFor(() => {
    expect(wss.clients.size).toBe(1);
    expect(onOpenMock).toHaveBeenCalledTimes(2);
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  await waitFor(() => {
    expect(sub1.onStartedMock).toHaveBeenCalledTimes(1);
    expect(sub1.onDataMock).toHaveBeenCalledTimes(1);
  });
  ee.emit('server:msg', {
    id: '2',
  });

  await waitFor(() => {
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
  await waitFor(() => {
    expect(wss.clients.size).toBe(1);
  });

  await close();

  await waitFor(() => {
    expect(onCloseMock).toHaveBeenCalledTimes(2);
  });
});

test('not found error', async () => {
  const { client, close, router } = factory();

  const error: TRPCClientError<typeof router> = await new Promise(
    // @ts-expect-error - testing runtime typeerrors
    (resolve, reject) => client.notFound.query().then(reject).catch(resolve),
  );

  expect(error.name).toBe('TRPCClientError');
  expect(error.shape?.data.code).toMatchInlineSnapshot(`"NOT_FOUND"`);

  await close();
});

test('batching', async () => {
  const t = factory();
  const promises = [
    t.client.greeting.query(),
    t.client.postEdit.mutate({ id: '', data: { text: '', title: '' } }),
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
  await t.close();
});

describe('regression test - slow createContext', () => {
  test('send messages immediately on connection', async () => {
    const t = factory({
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
    await t.close();
  });

  test('createContext throws', async () => {
    const createContext = vi.fn(async () => {
      await waitMs(20);
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'test' });
    });
    const t = factory({
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

    await waitFor(() => {
      expect(createContext).toHaveBeenCalledTimes(1);
    });

    await t.close();
  });
});

test('malformatted JSON', async () => {
  const t = factory({
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
  await t.close();
});

test('regression - badly shaped request', async () => {
  const t = factory();
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
  await t.close();
});

describe('include "jsonrpc" in response if sent with message', () => {
  test('queries & mutations', async () => {
    const t = factory();
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
        path: 'slow',
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
          "data": "slow query resolved",
          "type": "data",
        },
      }
    `);

    rawClient.close();
    await t.close();
  });

  test('subscriptions', async () => {
    const t = factory();
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
    await t.close();
  });
});

test.only('wsClient stops reconnecting after .close()', async () => {
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

  await waitFor(() => {
    expect(retryDelayMsMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock).toHaveBeenCalledTimes(1);
  });
  await waitFor(() => {
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
    const ctx = factory({
      wsClient: {
        lazy: {
          enabled: true,
          closeMs: 1,
        },
      },
    });
    const { client, wsClient } = ctx;
    expect(wsClient.connection).toBe(null);

    // --- do some queries and wait for the client to disconnect
    {
      const res = await Promise.all([
        client.greeting.query('query 1'),
        client.greeting.query('query 2'),
      ]);
      expect(res).toMatchInlineSnapshot(`
        Array [
          "hello query 1",
          "hello query 2",
        ]
      `);
      expect(wsClient.connection).not.toBe(null);

      await waitFor(() => {
        expect(ctx.onOpenMock).toHaveBeenCalledTimes(1);
        expect(ctx.onCloseMock).toHaveBeenCalledTimes(1);
      });
      expect(wsClient.connection).toBe(null);
    }
    {
      // --- do some more queries and wait for the client to disconnect again
      const res = await Promise.all([
        client.greeting.query('query 3'),
        client.greeting.query('query 4'),
      ]);
      expect(res).toMatchInlineSnapshot(`
        Array [
          "hello query 3",
          "hello query 4",
        ]
      `);

      await waitFor(() => {
        expect(ctx.onCloseMock).toHaveBeenCalledTimes(2);
        expect(ctx.onOpenMock).toHaveBeenCalledTimes(2);
      });
    }

    await ctx.close();
  });
  test('subscription', async () => {
    const ctx = factory({
      wsClient: {
        lazy: {
          enabled: true,
          closeMs: 1,
        },
      },
    });
    const { client, wsClient } = ctx;

    // --- do a subscription, check that we connect
    const onDataMock = vi.fn();

    expect(wsClient.connection).toBe(null);
    const sub = client.onMessageObservable.subscribe(undefined, {
      onData: onDataMock,
    });
    expect(wsClient.connection).not.toBe(null);

    expect(ctx.onOpenMock).toHaveBeenCalledTimes(0);
    await waitFor(() => {
      expect(ctx.onOpenMock).toHaveBeenCalledTimes(1);
    });

    // emit a message, check that we receive it
    ctx.ee.emit('server:msg', {
      id: '1',
    });
    await waitFor(() => expect(onDataMock).toHaveBeenCalledTimes(1));
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

    await waitFor(() => {
      expect(ctx.onCloseMock).toHaveBeenCalledTimes(1);
    });

    expect(wsClient.connection).toBe(null);

    await ctx.close();
  });

  // https://github.com/trpc/trpc/pull/5152
  test('race condition on dispatching / instant close', async () => {
    const ctx = factory({
      wsClient: {
        lazy: {
          enabled: true,
          closeMs: 0,
        },
      },
    });
    const { client, wsClient } = ctx;
    expect(wsClient.connection).toBe(null);

    // --- do some queries and wait for the client to disconnect
    {
      const res = await client.greeting.query('query 1');
      expect(res).toMatchInlineSnapshot('"hello query 1"');

      await waitFor(() => {
        expect(ctx.onOpenMock).toHaveBeenCalledTimes(1);
        expect(ctx.onCloseMock).toHaveBeenCalledTimes(1);
      });
      expect(wsClient.connection).toBe(null);
    }

    {
      // --- do some more queries and wait for the client to disconnect again
      const res = await Promise.all([
        client.greeting.query('query 3'),
        client.greeting.query('query 4'),
      ]);
      expect(res).toMatchInlineSnapshot(`
        Array [
          "hello query 3",
          "hello query 4",
        ]
      `);

      await waitFor(() => {
        expect(ctx.onCloseMock).toHaveBeenCalledTimes(2);
        expect(ctx.onOpenMock).toHaveBeenCalledTimes(2);
      });
    }
    await ctx.close();
  });
});

describe('lastEventId', () => {
  test('lastEventId', async () => {
    const ctx = factory({
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

      await waitFor(() => {
        expect(onStarted).toHaveBeenCalledTimes(1);
      });
      ctx.nextIterable();
      await waitFor(() => {
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

      await waitFor(() => {
        expect(onStarted).toHaveBeenCalledTimes(2);
      });
      ctx.nextIterable();

      await waitFor(() => {
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
    await ctx.close();
  });
});

describe('keep alive', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  function attachPongMock(wss: WebSocket.Server, pongMock: () => void) {
    return new Promise((resolve) => {
      wss.on('connection', (ws) => {
        ws.on('pong', pongMock);
        resolve(null);
      });
    });
  }
  test('pong message should be received', async () => {
    const pingMs = 2000;
    const pongWaitMs = 5000;
    const ctx = factory({
      wssServer: {
        keepAlive: {
          enabled: true,
          pingMs,
          pongWaitMs,
        },
      },
    });
    const pongMock = vi.fn();
    const { wsClient, wss } = ctx;
    await attachPongMock(wss, pongMock);
    {
      await vi.advanceTimersByTimeAsync(pingMs + pongWaitMs + 100);
      expect(wsClient.connection).not.toBe(null);
      expect(pongMock).toHaveBeenCalled();
    }
    await ctx.close();
  });
  test('no pong message should be received', async () => {
    const ctx = factory({});
    const pongMock = vi.fn();
    const { wsClient, wss } = ctx;
    await attachPongMock(wss, pongMock);
    {
      await vi.advanceTimersByTimeAsync(60000);
      expect(wsClient.connection).not.toBe(null);
      expect(pongMock).not.toHaveBeenCalled();
    }
    await ctx.close();
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
  });

  type AppRouter = typeof appRouter;

  const ctx = konn()
    .beforeEach(() => {
      const opts = routerToServerAndClientNew(appRouter, {
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
      });
      opts.wsClient.close();

      return opts;
    })
    .afterEach((ctx) => {
      return ctx.close?.();
    })
    .done();

  test('do a call without auth', async () => {
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
});
