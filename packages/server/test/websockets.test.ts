/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
import { EventEmitter } from 'events';
import { expectTypeOf } from 'expect-type';
import { z } from 'zod';
import * as trpc from '../src';
import { routerToServerAndClient } from './_testHelpers';
import { webSocketLink } from '../../client/src/links/webSocketLink';

test('wss server basic', async () => {
  const ee = new EventEmitter();
  type Message = {
    id: string;
  };

  const { client, close } = routerToServerAndClient(
    trpc
      .router()
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
      })
      .query('hello', {
        resolve() {
          return 'there';
        },
      }),
    {
      client({ wssUrl }) {
        return {
          links: [webSocketLink({ url: wssUrl })],
        };
      },
    },
  );
  const res = await client.query('hello');
  expect(res).toBe('there');
  // ee.once('server:connect', () => {
  //   setImmediate(() => {
  //     ee.emit('server:msg', {
  //       id: '1',
  //     });
  //     ee.emit('server:msg', {
  //       id: '2',
  //     });
  //   });
  // });
  // const msgs = await client.subscriptionOnce('onMessage', '');

  // expectTypeOf(msgs).toMatchTypeOf<Message[]>();
  // expect(msgs).toMatchInlineSnapshot(`
  //   Array [
  //     Object {
  //       "id": "1",
  //     },
  //     Object {
  //       "id": "2",
  //     },
  //   ]
  // `);

  // close();

  // expect(ee.listenerCount('server:msg')).toBe(0);
  // expect(ee.listenerCount('server:error')).toBe(0);
});
