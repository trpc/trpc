/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
// import WebSocket from 'ws';
import { waitFor } from '@testing-library/react';
import { TRPCClientError } from '@trpc/client';
import { EventEmitter } from 'events';
import { expectTypeOf } from 'expect-type';
import { default as WebSocket, default as ws } from 'ws';
import { z } from 'zod';
import { wsLink } from '../../client/src/links/wsLink';
import * as trpc from '../src';
import { TRPCError } from '../src';
import { TRPCRequest, TRPCResult } from '../src/rpc';
import { applyWSSHandler } from '../src/ws';
import { routerToServerAndClient, waitMs } from './_testHelpers';

type Message = {
  id: string;
};
function factory(config?: { createContext: () => Promise<any> }) {
  const ee = new EventEmitter();
  const subRef: {
    current: trpc.Subscription<Message>;
  } = {} as any;
  const onNewMessageSubscription = jest.fn();
  const subscriptionEnded = jest.fn();
  const onNewClient = jest.fn();
  const opts = routerToServerAndClient(
    trpc
      .router()
      .query('greeting', {
        input: z.string().nullish(),
        resolve({ input }) {
          return `hello ${input ?? 'world'}`;
        },
      })
      .mutation('slow', {
        async resolve() {
          await waitMs(50);
          return 'slow query resolved';
        },
      })
      .mutation('post.edit', {
        input: z.object({
          id: z.string(),
          data: z.object({
            title: z.string(),
            text: z.string(),
          }),
        }),
        async resolve({ input }) {
          const { id, data } = input;
          return {
            id,
            ...data,
          };
        },
      })
      .subscription('onMessage', {
        input: z.string().nullish(),
        resolve() {
          const sub = (subRef.current = new trpc.Subscription<Message>(
            (emit) => {
              const onMessage = (data: Message) => {
                emit.data(data);
              };
              ee.on('server:msg', onMessage);
              return () => {
                subscriptionEnded();
                ee.off('server:msg', onMessage);
              };
            },
          ));
          ee.emit('subscription:created');
          onNewMessageSubscription();
          return sub;
        },
      }),
    {
      wsClient: {
        retryDelayMs: () => 10,
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
    },
  );

  opts.wss.addListener('connection', onNewClient);
  return {
    ...opts,
    ee,
    subRef,
    onNewMessageSubscription,
    onNewClient,
  };
}

test('query', async () => {
  const { client, close } = factory();
  expect(await client.query('greeting')).toBe('hello world');
  expect(await client.query('greeting', null)).toBe('hello world');
  expect(await client.query('greeting', 'alexdotjs')).toBe('hello alexdotjs');

  close();
});

test('mutation', async () => {
  const { client, close } = factory();
  expect(
    await client.mutation('post.edit', {
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

  close();
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
  const next = jest.fn();
  const subscription = client.subscription('onMessage', undefined, {
    next(data) {
      expectTypeOf(data).not.toBeAny();
      expectTypeOf(data).toMatchTypeOf<TRPCResult<Message>>();
      next(data);
    },
  });

  await waitFor(() => {
    expect(next).toHaveBeenCalledTimes(3);
  });

  ee.emit('server:msg', {
    id: '2',
  });
  await waitFor(() => {
    expect(next).toHaveBeenCalledTimes(3);
  });

  expect(next.mock.calls).toMatchInlineSnapshot(`
    Array [
      Array [
        Object {
          "type": "started",
        },
      ],
      Array [
        Object {
          "data": Object {
            "id": "1",
          },
          "type": "data",
        },
      ],
      Array [
        Object {
          "data": Object {
            "id": "2",
          },
          "type": "data",
        },
      ],
      Array [
        Object {
          "data": Object {
            "id": "2",
          },
          "type": "data",
        },
      ],
    ]
  `);

  subscription.unsubscribe();
  await waitFor(() => {
    expect(ee.listenerCount('server:msg')).toBe(0);
    expect(ee.listenerCount('server:error')).toBe(0);
  });
  close();
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
  const next = jest.fn();
  const error = jest.fn();
  const complete = jest.fn();
  client.subscription('onMessage', undefined, {
    next,
    error,
    complete,
  });

  await waitFor(() => {
    expect(next).toHaveBeenCalledTimes(3);
  });
  // close websocket server
  await close();
  await waitFor(() => {
    expect(error).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(0);
  });
  expect(error.mock.calls[0][0]).toMatchInlineSnapshot(
    `[TRPCClientError: WebSocket closed prematurely]`,
  );
  expect(error.mock.calls[0][0].originalError.name).toBe(
    'TRPCWebSocketClosedError',
  );

  // start a new wss server on same port, and trigger a message
  next.mockClear();
  complete.mockClear();

  ee.once('subscription:created', () => {
    setTimeout(() => {
      ee.emit('server:msg', {
        id: '3',
      });
    }, 1);
  });

  const wss = new ws.Server({ port: wssPort });
  applyWSSHandler({ ...applyWSSHandlerOpts, wss });

  await waitFor(() => {
    expect(next).toHaveBeenCalledTimes(2);
  });
  expect(next.mock.calls.map((args) => args[0])).toMatchInlineSnapshot(`
    Array [
      Object {
        "type": "started",
      },
      Object {
        "data": Object {
          "id": "3",
        },
        "type": "data",
      },
    ]
  `);

  wss.close();
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
  const next = jest.fn();
  const error = jest.fn();
  const complete = jest.fn();
  client.subscription('onMessage', undefined, {
    next,
    error,
    complete,
  });

  await waitFor(() => {
    expect(next).toHaveBeenCalledTimes(3);
  });
  // destroy server subscription
  subRef.current.destroy();
  await waitFor(() => {
    expect(error).toHaveBeenCalledTimes(1);
  });
  expect(complete).toHaveBeenCalledTimes(0);
  expect(error).toHaveBeenCalledTimes(1);
  expect(error.mock.calls[0][0]).toMatchInlineSnapshot(
    `[TRPCClientError: Operation ended prematurely]`,
  );
  close();
});

test('sub emits errors', async () => {
  const { client, close, wss, ee, subRef } = factory();

  ee.once('subscription:created', () => {
    setTimeout(() => {
      subRef.current.emitError(new Error('test'));
      ee.emit('server:msg', {
        id: '1',
      });
    });
  });
  const onNewClient = jest.fn();
  wss.addListener('connection', onNewClient);
  const next = jest.fn();
  const error = jest.fn();
  const complete = jest.fn();
  client.subscription('onMessage', undefined, {
    next,
    error,
    complete,
  });

  await waitFor(() => {
    expect(next).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(0);
  });

  close();
});

test('wait for slow queries/mutations before disconnecting', async () => {
  const { client, close, wsClient, onNewClient } = factory();

  await waitFor(() => {
    expect(onNewClient).toHaveBeenCalledTimes(1);
  });
  const promise = client.mutation('slow');
  wsClient.close();
  expect(await promise).toMatchInlineSnapshot(`"slow query resolved"`);
  close();
  await waitFor(() => {
    expect((wsClient.getConnection() as any as WebSocket).readyState).toBe(
      WebSocket.CLOSED,
    );
  });
  close();
});

test('subscriptions are automatically resumed', async () => {
  const { client, close, ee, wssHandler, wss } = factory();
  ee.once('subscription:created', () => {
    setTimeout(() => {
      ee.emit('server:msg', {
        id: '1',
      });
    });
  });
  function createSub() {
    const next = jest.fn();
    const error = jest.fn();
    const complete = jest.fn();
    const unsub = client.subscription('onMessage', undefined, {
      next,
      error,
      complete,
    });
    return { next, complete, error, unsub };
  }
  const sub1 = createSub();

  await waitFor(() => {
    expect(sub1.next).toHaveBeenCalledTimes(2);
  });
  wssHandler.broadcastReconnectNotification();
  await waitFor(() => {
    expect(wss.clients.size).toBe(1);
  });

  await waitFor(() => {
    expect(sub1.next).toHaveBeenCalledTimes(3);
  });
  ee.emit('server:msg', {
    id: '2',
  });

  await waitFor(() => {
    expect(sub1.next).toHaveBeenCalledTimes(4);
  });
  expect(sub1.next.mock.calls.map((args) => args[0])).toMatchInlineSnapshot(`
    Array [
      Object {
        "type": "started",
      },
      Object {
        "data": Object {
          "id": "1",
        },
        "type": "data",
      },
      Object {
        "type": "started",
      },
      Object {
        "data": Object {
          "id": "2",
        },
        "type": "data",
      },
    ]
  `);
  await waitFor(() => {
    expect(wss.clients.size).toBe(1);
  });

  close();
});

test('not found error', async () => {
  const { client, close, router } = factory();

  const error: TRPCClientError<typeof router> = await new Promise(
    (resolve, reject) =>
      client
        .query('notFound' as any)
        .then(reject)
        .catch(resolve),
  );

  expect(error.name).toBe('TRPCClientError');
  expect(error.shape?.data.code).toMatchInlineSnapshot(`"NOT_FOUND"`);

  close();
});

test('batching', async () => {
  const t = factory();
  const promises = [
    t.client.query('greeting'),
    t.client.mutation('post.edit', { id: '', data: { text: '', title: '' } }),
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
  t.close();
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

    const msg: TRPCRequest = {
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
    t.close();
  });

  test('createContext throws', async () => {
    const createContext = jest.fn(async () => {
      await waitMs(20);
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'test' });
    });
    const t = factory({
      createContext,
    });
    // close built-in client immediately to prevent connection
    t.wsClient.close();
    const rawClient = new WebSocket(t.wssUrl);

    const msg: TRPCRequest = {
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
    t.close();
  });
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

  expect(res).toMatchInlineSnapshot(`
    Object {
      "error": Object {
        "code": -32700,
        "data": Object {
          "code": "PARSE_ERROR",
          "httpStatus": 400,
          "stack": "[redacted]",
        },
        "message": "Unexpected token o in JSON at position 1",
      },
      "id": null,
    }
  `);
  t.close();
});

test('regression - badly shaped request', async () => {
  const t = factory();
  const rawClient = new WebSocket(t.wssUrl);

  const msg: TRPCRequest = {
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
  t.close();
});
