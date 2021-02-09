/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
import { EventEmitter } from 'events';
import { expectTypeOf } from 'expect-type';
import * as z from 'zod';
import * as trpc from '../src';
import { routerToServerAndClient } from './_testHelpers';

test('subscriptionOnce', async () => {
  const ee = new EventEmitter();
  type Message = {
    id: string;
    text: string;
  };

  const { client, close } = routerToServerAndClient(
    trpc.router().subscription('onMessage', {
      input: z.string().optional(),
      resolve() {
        ee.emit('connect');
        return new trpc.Subscription<Message>({
          start(emit) {
            const onMessage = (data: Message) => {
              emit.data(data);
            };
            ee.on('msg', onMessage);
            return () => ee.off('msg', onMessage);
          },
        });
      },
    }),
  );
  const msg: Message = {
    id: '1',
    text: 'hi',
  };
  ee.once('connect', () => {
    setImmediate(() => ee.emit('msg', msg));
  });
  const [receivedMsg] = await client.subscriptionOnce('onMessage', '');

  expect(receivedMsg).toEqual(msg);
  expectTypeOf(receivedMsg).toMatchTypeOf<Message>();

  close();
});
