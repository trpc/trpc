import { EventEmitter } from 'events';
import { routerToServerAndClientNew, waitMs } from './___testHelpers';
import { waitFor } from '@testing-library/react';
import {
  createTRPCWebSocket,
  TRPCClientError,
  TRPCWebSocketClientOptions,
  wsLink,
} from '@trpc/client';
import { initTRPC, TRPCError } from '@trpc/server';
import { applyWSSHandler } from '@trpc/server/src/adapters/ws';
import { observable, Observer } from '@trpc/server/src/observable';
import {
  TRPCClientOutgoingMessage,
  TRPCRequestMessage,
} from '@trpc/server/src/rpc';
import { AnyRouter } from '@trpc/server/unstableInternalsExport';
import WebSocket, { Server } from 'ws';
import { z } from 'zod';

type Message = {
  id: string;
};

function factory(config?: {
  createContext?: () => Promise<any>;
  wsClient?: Partial<TRPCWebSocketClientOptions>;
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

  const appRouter = t.router({
    greeting: t.procedure.input(z.string().nullish()).query(({ input }) => {
      return `hello ${input ?? 'world'}`;
    }),

    slow: t.procedure.mutation(async ({}) => {
      onSlowMutationCalled();
      await waitMs(50);
      return 'slow query resolved';
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

    onMessage: t.procedure.input(z.string().nullish()).subscription(({}) => {
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
  });

  const onOpenMock = vi.fn();
  const onCloseMock = vi.fn();

  expectTypeOf(appRouter).toMatchTypeOf<AnyRouter>();
  // TODO: Uncomment when the expect-type library gets fixed
  // expectTypeOf<AnyRouter>().toMatchTypeOf<typeof appRouter>();

  const opts = routerToServerAndClientNew(appRouter, {
    wsClient: {
      retryDelayMs: () => 10,
      onOpen: onOpenMock,
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
      ...(config ?? {}),
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
    onCloseMock,
    onSlowMutationCalled,
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

test('basic subscription test', async () => {
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
  const subscription = client.onMessage.subscribe(undefined, {
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

test.skip('$subscription() - server randomly stop and restart (this test might be flaky, try re-running)', async () => {
  const { client, close, ee, wssPort, applyWSSHandlerOpts } = factory();
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
  client.onMessage.subscribe(undefined, {
    onStarted: onStartedMock,
    onData: onDataMock,
    onError: onErrorMock,
    onComplete: onCompleteMock,
  });

  await waitFor(() => {
    expect(onStartedMock).toHaveBeenCalledTimes(1);
    expect(onDataMock).toHaveBeenCalledTimes(2);
  });
  // close websocket server
  await close();
  await waitFor(() => {
    expect(onErrorMock).toHaveBeenCalledTimes(1);
    expect(onCompleteMock).toHaveBeenCalledTimes(0);
  });
  expect(onErrorMock.mock.calls[0]![0]!).toMatchInlineSnapshot(
    `[TRPCClientError: WebSocket closed prematurely]`,
  );
  expect(onErrorMock.mock.calls[0]![0]!.originalError.name).toBe(
    'TRPCWebSocketClosedError',
  );

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

  const wss = new Server({ port: wssPort });
  applyWSSHandler({ ...applyWSSHandlerOpts, wss });

  await waitFor(() => {
    expect(onStartedMock).toHaveBeenCalledTimes(1);
    expect(onDataMock).toHaveBeenCalledTimes(1);
  });
  expect(onDataMock.mock.calls.map((args) => args[0])).toMatchInlineSnapshot(`
    Array [
      Object {
        "id": "3",
      },
    ]
  `);

  await new Promise((resolve) => {
    wss.close(resolve);
  });
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
  client.onMessage.subscribe(undefined, {
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
  client.onMessage.subscribe(undefined, {
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
  client.onMessage.subscribe(undefined, {
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

test(
  'wait for slow queries/mutations before disconnecting',
  async () => {
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

    await close();
    await waitFor(() => {
      expect(conn.ws!.readyState).toBe(WebSocket.CLOSED);
    });
    await close();
  },
  {
    retry: 5,
  },
);

test(
  'requests get aborted if called before connection is established and requests dispatched',
  async () => {
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
  },
  {
    // retry: 5
  },
);

test(
  'subscriptions are automatically resumed',
  async () => {
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
      const unsub = client.onMessage.subscribe(undefined, {
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
  },
  {
    // retry: 5
  },
);

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
  test(
    'send messages immediately on connection',
    async () => {
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
          resolve(msg.data as any);
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
    },
    { retry: 5 },
  );

  test(
    'createContext throws',
    async () => {
      const createContext = vi.fn(async () => {
        await waitMs(20);
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'test' });
      });
      const t = factory({
        createContext,
      });
      // close built-in client immediately to prevent connection
      t.wsClient.close();
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
        responses.push(JSON.parse(msg.data as any));
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
      await t.close();
    },
    { retry: 5 },
  );
});

test('malformatted JSON', async () => {
  const t = factory();
  // close built-in client immediately to prevent connection
  t.wsClient.close();
  const rawClient = new WebSocket(t.wssUrl);

  rawClient.onopen = () => {
    rawClient.send('not json');
  };

  const res: any = await new Promise<string>((resolve) => {
    rawClient.addEventListener('message', (msg) => {
      resolve(JSON.parse(msg.data as any));
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
      resolve(msg.data as any);
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
        resolve(msg.data as any);
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
        resolve(msg.data as any);
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
        path: 'onMessage',
        input: null,
      },
    };

    rawClient.onopen = () => {
      rawClient.send(JSON.stringify(subscriptionMessageWithJsonRPC));
    };

    const startedResult = await new Promise<string>((resolve) => {
      rawClient.addEventListener('message', (msg) => {
        resolve(msg.data as any);
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
        resolve(msg.data as any);
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
        resolve(msg.data as any);
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

test('wsClient stops reconnecting after .close()', async () => {
  const badWsUrl = 'ws://localhost:9999';
  const retryDelayMsMock = vi.fn();
  retryDelayMsMock.mockReturnValue(100);

  const wsClient = createTRPCWebSocket({
    url: badWsUrl,
    retryDelayMs: retryDelayMsMock,
  });

  await waitFor(() => {
    expect(retryDelayMsMock).toHaveBeenCalledTimes(1);
  });
  await waitFor(() => {
    expect(retryDelayMsMock).toHaveBeenCalledTimes(2);
  });
  wsClient.close();
  await waitMs(100);
  expect(retryDelayMsMock).toHaveBeenCalledTimes(2);
});
describe('lazy mode', () => {
  test('happy path', async () => {
    const ctx = factory({
      wsClient: {
        lazy: {
          enabled: true,
          closeMs: 100,
        },
      },
    });
    const { client, wsClient } = ctx;
    expect(wsClient.connection).toBe(null);

    // --- do some queries and wait for the client to disconnect
    await client.greeting.query();
    expect(wsClient.connection).not.toBe(null);
    await client.greeting.query();

    await waitFor(() => {
      expect(ctx.onOpenMock).toHaveBeenCalledTimes(1);
      expect(ctx.onCloseMock).toHaveBeenCalledTimes(1);
    });
    expect(wsClient.connection).toBe(null);

    // --- do some more queries and wait for the client to disconnect again
    await client.greeting.query();

    await waitFor(() => {
      expect(ctx.onCloseMock).toHaveBeenCalledTimes(2);
      expect(ctx.onOpenMock).toHaveBeenCalledTimes(2);
    });

    await ctx.close();
  });
  test('subscription', async () => {
    const ctx = factory({
      wsClient: {
        lazy: {
          enabled: true,
          closeMs: 100,
        },
      },
    });
    const { client, wsClient } = ctx;

    // --- do a subscription, check that we connect
    const onDataMock = vi.fn();

    expect(wsClient.connection).toBe(null);
    const sub = client.onMessage.subscribe(undefined, {
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
});
