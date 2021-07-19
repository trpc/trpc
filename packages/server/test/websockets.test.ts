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
});

test('$subscription()', async () => {
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
});

test('$subscription() - server randomly stop and restart (this test might be flaky, try re-running)', async () => {
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
  // close websocket server
  await close();
  await waitFor(() => {
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(0);
  });
  expect(onError.mock.calls[0][0]).toMatchInlineSnapshot(
    `[TRPCClientError: WebSocket closed prematurely]`,
  );
  expect(onError.mock.calls[0][0].originalError.name).toBe(
    'TRPCWebSocketClosedError',
  );

  // start a new wss server on same port, and trigger a message
  onNext.mockClear();
  onDone.mockClear();

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
    expect(onNext).toHaveBeenCalledTimes(2);
  });
  expect(onNext.mock.calls.map((args) => args[0])).toMatchInlineSnapshot(`
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
  expect(onError).toHaveBeenCalledTimes(1);
  expect(onError.mock.calls[0][0]).toMatchInlineSnapshot(
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
    expect(wss.clients.size).toBe(1);
  });

  await waitFor(() => {
    expect(sub1.onNext).toHaveBeenCalledTimes(3);
  });
  ee.emit('server:msg', {
    id: '2',
  });

  await waitFor(() => {
    expect(sub1.onNext).toHaveBeenCalledTimes(4);
  });
  expect(sub1.onNext.mock.calls.map((args) => args[0])).toMatchInlineSnapshot(`
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
  expect(error.shape?.data.code).toMatchInlineSnapshot(`"PATH_NOT_FOUND"`);

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
  t.close();
});
