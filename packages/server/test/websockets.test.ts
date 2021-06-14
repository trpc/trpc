/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
// import WebSocket from 'ws';
import { waitFor } from '@testing-library/react';
import { EventEmitter } from 'events';
// import { expectTypeOf } from 'expect-type';
import ws from 'ws';
import { z } from 'zod';
import {
  createWSClient,
  TRPCWebSocketClient,
  WebSocketInterruptedError,
  wsLink,
} from '../../client/src/links/wsLink';
import * as trpc from '../src';
import { wssHandler } from '../src/ws';
import { routerToServerAndClient } from './_testHelpers';

function factory() {
  const ee = new EventEmitter();
  type Message = {
    id: string;
  };
  let wsClient: TRPCWebSocketClient = null as any;
  const opts = routerToServerAndClient(
    trpc
      .router()
      .query('greeting', {
        input: z.string().nullish(),
        resolve({ input }) {
          return `hello ${input ?? 'world'}`;
        },
      })
      .subscription('onMessage', {
        input: z.string().optional(),
        resolve() {
          ee.emit('server:connect');
          return new trpc.Subscription<Message>({
            start(emit) {
              const onMessage = (data: Message) => {
                emit.data(data);
              };
              ee.on('server:msg', onMessage);
              return () => ee.off('server:msg', onMessage);
            },
          });
        },
      }),
    {
      client({ wssUrl }) {
        wsClient = createWSClient({ url: wssUrl, retryDelay: () => 0 });
        return {
          links: [wsLink({ client: wsClient })],
        };
      },
    },
  );

  return {
    ee,
    wsClient,
    ...opts,
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

test('subscriptionOnce()', async () => {
  const { client, close, wsClient, ee } = factory();
  ee.once('server:connect', () => {
    setImmediate(() => {
      ee.emit('server:msg', {
        id: '1',
      });
    });
  });
  const msgs = await client.subscriptionOnce('onMessage', '');

  expect(msgs).toMatchInlineSnapshot(`
    Object {
      "id": "1",
    }
  `);

  await waitFor(() => {
    expect(ee.listenerCount('server:msg')).toBe(0);
    expect(ee.listenerCount('server:error')).toBe(0);
  });
  close();
  wsClient.close();
});

test('$subscription()', async () => {
  const ee = new EventEmitter();
  type Message = {
    id: string;
  };
  let wsClient: TRPCWebSocketClient = null as any;
  const { client, close } = routerToServerAndClient(
    trpc.router().subscription('onMessage', {
      input: z.string().optional(),
      resolve() {
        ee.emit('server:connect');
        return new trpc.Subscription<Message>({
          start(emit) {
            const onMessage = (data: Message) => {
              emit.data(data);
            };
            ee.on('server:msg', onMessage);
            return () => ee.off('server:msg', onMessage);
          },
        });
      },
    }),
    {
      client({ wssUrl }) {
        wsClient = createWSClient({ url: wssUrl });
        return {
          links: [wsLink({ client: wsClient })],
        };
      },
    },
  );
  ee.once('server:connect', () => {
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
  const unsub = client.$subscription('onMessage', undefined, {
    onNext,
  });

  await waitFor(() => {
    expect(onNext).toHaveBeenCalledTimes(2);
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

  unsub();
  await waitFor(() => {
    expect(ee.listenerCount('server:msg')).toBe(0);
    expect(ee.listenerCount('server:error')).toBe(0);
  });
  close();
  wsClient.close();
});

test('$subscription() - server randomly stop and restart', async () => {
  const { client, close, wsClient, ee, wssPort, wssHandlerOpts } = factory();
  ee.once('server:connect', () => {
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
  client.$subscription('onMessage', undefined, {
    onNext,
    onError,
    onDone,
  });

  await waitFor(() => {
    expect(onNext).toHaveBeenCalledTimes(2);
  });
  // close websocket
  close();
  await waitFor(() => {
    expect(onError).toHaveBeenCalledTimes(1);
  });
  expect(onError.mock.calls[0][0]).toMatchInlineSnapshot(
    `[Error: Operation ended prematurely]`,
  );
  expect(onError.mock.calls[0][0].originalError).toBeInstanceOf(
    WebSocketInterruptedError,
  );

  // reconnect from client
  client.$subscription('onMessage', undefined, {
    onNext,
    onError,
    onDone,
  });

  // start a new wss server on same port, and trigger a message
  onNext.mockClear();
  onDone.mockClear();
  ee.once('server:connect', () => {
    setImmediate(() => {
      ee.emit('server:msg', {
        id: '3',
      });
    });
  });
  const wss = new ws.Server({ port: wssPort });
  wssHandler({ ...wssHandlerOpts, wss });
  await waitFor(() => {
    expect(onNext).toHaveBeenCalledTimes(1);
  });
  expect(onNext.mock.calls).toMatchInlineSnapshot(`
    Array [
      Array [
        Object {
          "id": "3",
        },
      ],
    ]
  `);

  wsClient.close();
  wss.close();
});
