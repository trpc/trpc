/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
import { EventEmitter } from 'events';
import { expectTypeOf } from 'expect-type';
import { z } from 'zod';
import * as trpc from '../src';
import { routerToServerAndClient } from './_testHelpers';
import { webSocketLink } from '../../client/src/links/webSocketLink';
import WebSocket from 'ws';
import { waitFor } from '@testing-library/react';

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
        ws = new WebSocket(wssUrl);
        return {
          links: [webSocketLink({ ws })],
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
        ws = new WebSocket(wssUrl);
        return {
          links: [webSocketLink({ ws })],
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
