/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
// import WebSocket from 'ws';
import { waitFor } from '@testing-library/react';
import { EventEmitter } from 'events';
import { expectTypeOf } from 'expect-type';
// import { expectTypeOf } from 'expect-type';
import { z } from 'zod';
import {
  createWebSocketClient,
  TRPCWebSocketClient,
  wsLink,
} from '../../client/src/links/wsLink';
import * as trpc from '../src';
import { routerToServerAndClient } from './_testHelpers';

test('query', async () => {
  let ws: any = null;
  const { client, close } = routerToServerAndClient(
    trpc.router().query('hello', {
      resolve() {
        return 'there';
      },
    }),
    {
      client({ wssUrl }) {
        ws = createWebSocketClient({ url: wssUrl });
        return {
          links: [wsLink({ client: ws })],
        };
      },
    },
  );
  const res = await client.query('hello');
  expect(res).toBe('there');

  close();
  ws.close();
});

test('subscriptionOnce()', async () => {
  const ee = new EventEmitter();
  type Message = {
    id: string;
  };
  let ws: any = null;

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
        ws = createWebSocketClient({ url: wssUrl });
        return {
          links: [wsLink({ client: ws })],
        };
      },
    },
  );
  ee.once('server:connect', () => {
    setImmediate(() => {
      ee.emit('server:msg', {
        id: '1',
      });
    });
  });
  const msgs = await client.subscriptionOnce('onMessage', '');

  expectTypeOf(msgs).toMatchTypeOf<Message[]>();
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
  ws.close();
});

test('$subscription()', async () => {
  const ee = new EventEmitter();
  type Message = {
    id: string;
  };
  let ws: TRPCWebSocketClient = null as any;
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
        ws = createWebSocketClient({ url: wssUrl });
        return {
          links: [wsLink({ client: ws })],
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
        id: '1',
      });
    });
  });
  const callback = jest.fn();
  const $sub = client.$subscription('onMessage');

  $sub.subscribe({ onNext: callback });

  await waitFor(() => {
    expect(callback).toHaveBeenCalledTimes(2);
  });

  expect(callback.mock.calls).toMatchInlineSnapshot(`
    Array [
      Array [
        Object {
          "id": "1",
        },
      ],
      Array [
        Object {
          "id": "1",
        },
      ],
    ]
  `);

  $sub.done();
  await waitFor(() => {
    expect(ee.listenerCount('server:msg')).toBe(0);
    expect(ee.listenerCount('server:error')).toBe(0);
  });
  close();
  ws.close();
});
