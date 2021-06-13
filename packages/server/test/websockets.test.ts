/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
// import WebSocket from 'ws';
import { waitFor } from '@testing-library/react';
import { EventEmitter } from 'events';
import { expectTypeOf } from 'expect-type';
// import { expectTypeOf } from 'expect-type';
import { z } from 'zod';
import {
  createWSClient,
  TRPCWebSocketClient,
  wsLink,
} from '../../client/src/links/wsLink';
import * as trpc from '../src';
import { routerToServerAndClient } from './_testHelpers';

test('query', async () => {
  let ws: any = null;
  const { client, close } = routerToServerAndClient(
    trpc.router().query('greeting', {
      input: z.string().nullish(),
      resolve({ input }) {
        return `hello ${input ?? 'world'}`;
      },
    }),
    {
      client({ wssUrl }) {
        ws = createWSClient({ url: wssUrl });
        return {
          links: [wsLink({ client: ws })],
        };
      },
    },
  );
  expect(await client.query('greeting')).toBe('hello world');
  expect(await client.query('greeting', null)).toBe('hello world');
  expect(await client.query('greeting', 'alexdotjs')).toBe('hello alexdotjs');

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
        ws = createWSClient({ url: wssUrl });
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
        ws = createWSClient({ url: wssUrl });
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
  ws.close();
});
