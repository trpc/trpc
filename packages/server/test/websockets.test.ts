/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
// import WebSocket from 'ws';
import { waitFor } from '@testing-library/react';
import { TRPCClientError } from '@trpc/client';
import { EventEmitter } from 'events';
import { expectTypeOf } from 'expect-type';
import { default as WebSocket, default as ws } from 'ws';
import { z } from 'zod';
import {
  createWSClient,
  TRPCWebSocketClient,
  wsLink,
} from '../../client/src/links/wsLink';
import * as trpc from '../src';
import { TRPCResult } from '../src/rpc';
import { applyWSSHandler } from '../src/ws';
import { routerToServerAndClient } from './_testHelpers';

type Message = {
  id: string;
};
function factory() {
  const ee = new EventEmitter();
  const subRef: {
    current: trpc.Subscription<Message>;
  } = {} as any;
  let wsClient: TRPCWebSocketClient = null as any;
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
          await new Promise((resolve) => setTimeout(resolve, 50));
          return 'slow query resolved';
        },
      })
      .mutation('posts.edit', {
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
        input: z.string().optional(),
        resolve() {
          const sub = (subRef.current = new trpc.Subscription<Message>({
            start(emit) {
              const onMessage = (data: Message) => {
                emit.data(data);
              };
              ee.on('server:msg', onMessage);
              return () => {
                subscriptionEnded();
                ee.off('server:msg', onMessage);
              };
            },
          }));
          ee.emit('subscription:created');
          onNewMessageSubscription();
          return sub;
        },
      }),
    {
      client({ wssUrl }) {
        wsClient = createWSClient({
          url: wssUrl,
          retryDelayMs: () => 10,
          staleConnectionTimeoutMs: 200,
        });
        return {
          links: [wsLink({ client: wsClient })],
        };
      },
    },
  );

  opts.wss.addListener('connection', onNewClient);
  return {
    ee,
    wsClient,
    ...opts,
    subRef,
    onNewMessageSubscription,
    onNewClient,
  };
}

test('query', async () => {
  const { client, close, wsClient } = factory();
  expect(await client.query('greeting')).toBe('hello world');
  expect(await client.query('greeting', null)).toBe('hello world');
  expect(await client.query('greeting', 'alexdotjs')).toBe('hello alexdotjs');

  close();
  wsClient.close();
});

test('mutation', async () => {
  const { client, close, wsClient } = factory();
  expect(
    await client.mutation('posts.edit', {
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
  wsClient.close();
});

test('$subscription()', async () => {
  const { client, close, ee, wsClient } = factory();
  ee.once('subscription:created', () => {
    setImmediate(() => {
      ee.emit('server:msg', {
        id: '1',
      });
      ee.emit('server:msg', {
        id: '2',
      });
    });
  });
  const onNext = jest.fn();
  const unsub = client.subscription('onMessage', undefined, {
    onNext(data) {
      expectTypeOf(data).not.toBeAny();
      expectTypeOf(data).toMatchTypeOf<TRPCResult<Message>>();
      onNext(data);
    },
  });

  await waitFor(() => {
    expect(onNext).toHaveBeenCalledTimes(3);
  });

  ee.emit('server:msg', {
    id: '2',
  });
  await waitFor(() => {
    expect(onNext).toHaveBeenCalledTimes(3);
  });

  expect(onNext.mock.calls).toMatchInlineSnapshot(`
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

  unsub();
  await waitFor(() => {
    expect(ee.listenerCount('server:msg')).toBe(0);
    expect(ee.listenerCount('server:error')).toBe(0);
  });
  close();
  wsClient.close();
});

test.skip('$subscription() - server randomly stop and restart (this test might be flaky, try re-running)', async () => {
  const { client, close, wsClient, ee, wssPort, applyWSSHandlerOpts } =
    factory();
  ee.once('subscription:created', () => {
    setImmediate(() => {
      ee.emit('server:msg', {
        id: '1',
      });
      ee.emit('server:msg', {
        id: '2',
      });
    });
  });
  const onNext = jest.fn();
  const onError = jest.fn();
  const onDone = jest.fn();
  client.subscription('onMessage', undefined, {
    onNext,
    onError,
    onDone,
  });

  await waitFor(() => {
    expect(onNext).toHaveBeenCalledTimes(3);
  });
  // close websocket
  await close();
  await waitFor(() => {
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
  expect(onError.mock.calls[0][0]).toMatchInlineSnapshot(
    `[TRPCClientError: Operation ended prematurely]`,
  );
  expect(onError.mock.calls[0][0].originalError.name).toBe(
    'TRPCWebSocketClosedError',
  );

  // reconnect from client
  ee.once('subscription:created', () => {
    setTimeout(() => {
      ee.emit('server:msg', {
        id: '3',
      });
    }, 1);
  });
  client.subscription('onMessage', undefined, {
    onNext,
    onError,
    onDone,
  });

  // start a new wss server on same port, and trigger a message
  onNext.mockClear();
  onDone.mockClear();

  const wss = new ws.Server({ port: wssPort });
  applyWSSHandler({ ...applyWSSHandlerOpts, wss });

  await waitFor(() => {
    expect(onNext).toHaveBeenCalledTimes(2);
  });
  expect(onNext.mock.calls).toMatchInlineSnapshot(`
    Array [
      Array [
        Object {
          "type": "started",
        },
      ],
      Array [
        Object {
          "data": Object {
            "id": "3",
          },
          "type": "data",
        },
      ],
    ]
  `);

  wsClient.close();
  wss.close();
});

test('server subscription ended', async () => {
  const { client, close, wsClient, ee, subRef } = factory();
  ee.once('subscription:created', () => {
    setImmediate(() => {
      ee.emit('server:msg', {
        id: '1',
      });
      ee.emit('server:msg', {
        id: '2',
      });
    });
  });
  const onNext = jest.fn();
  const onError = jest.fn();
  const onDone = jest.fn();
  client.subscription('onMessage', undefined, {
    onNext,
    onError,
    onDone,
  });

  await waitFor(() => {
    expect(onNext).toHaveBeenCalledTimes(3);
  });
  // destroy server subscription
  subRef.current.destroy();
  await waitFor(() => {
    expect(onDone).toHaveBeenCalledTimes(1);
  });
  wsClient.close();
  close();
});

test('server emits disconnect', async () => {
  const {
    client,
    close,
    wsClient,
    wssHandler,
    onNewMessageSubscription,
    onNewClient,
  } = factory();

  const onNext = jest.fn();
  const onError = jest.fn();
  const onDone = jest.fn();
  client.subscription('onMessage', undefined, {
    onNext,
    onError,
    onDone,
  });

  await waitFor(() => {
    expect(onNewMessageSubscription).toHaveBeenCalledTimes(1);
    expect(onNewClient).toHaveBeenCalledTimes(1);
  });
  wssHandler.broadcastReconnectNotification();
  await waitFor(() => {
    expect(onNewMessageSubscription).toHaveBeenCalledTimes(1);
    expect(onNewClient).toHaveBeenCalledTimes(2);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  wsClient.close();
  close();
});

test('sub emits errors', async () => {
  const { client, close, wsClient, wss, ee, subRef } = factory();

  ee.once('subscription:created', () => {
    setImmediate(() => {
      subRef.current.emitError(new Error('test'));
      ee.emit('server:msg', {
        id: '1',
      });
    });
  });
  const onNewClient = jest.fn();
  wss.addListener('connection', onNewClient);
  const onNext = jest.fn();
  const onError = jest.fn();
  const onDone = jest.fn();
  client.subscription('onMessage', undefined, {
    onNext,
    onError,
    onDone,
  });

  await waitFor(() => {
    expect(onNext).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(0);
  });

  wsClient.close();
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
});

test('ability to do do overlapping connects', async () => {
  const { client, close, wsClient, ee, wssHandler, wss } = factory();
  ee.once('subscription:created', () => {
    setImmediate(() => {
      ee.emit('server:msg', {
        id: '1',
      });
    });
  });
  function createSub() {
    const onNext = jest.fn();
    const onError = jest.fn();
    const onDone = jest.fn();
    const unsub = client.subscription('onMessage', undefined, {
      onNext,
      onError,
      onDone,
    });
    return { onNext, onDone, onError, unsub };
  }
  const sub1 = createSub();

  await waitFor(() => {
    expect(sub1.onNext).toHaveBeenCalledTimes(2);
  });
  wssHandler.broadcastReconnectNotification();
  await waitFor(() => {
    expect(sub1.onError.mock.calls[0][0].originalError.name).toBe(
      'TRPCReconnectError',
    );
    expect(wss.clients.size).toBe(2);
  });
  const sub2 = createSub();
  await waitFor(() => {
    expect(sub2.onNext).toHaveBeenCalledWith({
      type: 'started',
    });
  });
  sub1.unsub();
  await waitFor(() => {
    expect(wss.clients.size).toBe(1);
  });

  wsClient.close();
  close();
});

test('not found error', async () => {
  const { client, close, wsClient, router } = factory();

  const error: TRPCClientError<typeof router> = await new Promise(
    (resolve, reject) =>
      client
        .query('notFound' as any)
        .then(reject)
        .catch(resolve),
  );

  expect(error.name).toBe('TRPCClientError');
  expect(error.shape?.data.code).toMatchInlineSnapshot(`"PATH_NOT_FOUND"`);

  wsClient.close();
  close();
});

test('batching', async () => {
  const t = factory();
  const promises = [
    t.client.query('greeting'),
    t.client.mutation('posts.edit', { id: '', data: { text: '', title: '' } }),
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
