/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
import { EventEmitter } from 'events';
import { expectTypeOf } from 'expect-type';
import * as z from 'zod';
import * as trpc from '../src';
import { routerToServerAndClient } from './_testHelpers';

test('subscriptionOnce() + type safety + backpressure', async () => {
  const ee = new EventEmitter();
  type Message = {
    id: string;
    text: string;
  };

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
      subscriptions: {
        backpressureMs: 10,
      },
    },
  );
  ee.once('server:connect', () => {
    setImmediate(() => {
      ee.emit('server:msg', {
        id: '1',
        text: 'hi',
      });
      ee.emit('server:msg', {
        id: '2',
        text: 'there',
      });
    });
  });
  const msgs = await client.subscriptionOnce('onMessage', '');

  expectTypeOf(msgs).toMatchTypeOf<Message[]>();
  expect(msgs).toMatchInlineSnapshot(`
    Array [
      Object {
        "id": "1",
        "text": "hi",
      },
      Object {
        "id": "2",
        "text": "there",
      },
    ]
  `);

  close();
});

test('subscriptions()', async () => {
  const ee = new EventEmitter();
  type Message = {
    id: string;
    text: string;
  };

  let allInputs: unknown[] = [];
  const onConnect = jest.fn(() => {
    ee.emit('server:connect');
  });
  const { client, close } = routerToServerAndClient(
    trpc.router().subscription('onMessage', {
      input: z.string().optional(),
      resolve({ input }) {
        onConnect();
        allInputs.push(input);
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
      subscriptions: {
        backpressureMs: 10,
      },
    },
  );
  ee.once('server:connect', () => {
    setTimeout(() => {
      ee.emit('server:msg', {
        id: '1',
        text: 'hi',
      });
      ee.emit('server:msg', {
        id: '2',
        text: 'there',
      });
    }, 1);
  });

  const allResponses: unknown[] = [];
  const unsub = client.subscription('onMessage', {
    initialInput: undefined,
    onData(res) {
      ee.emit('client:response');
      allResponses.push(res);
    },
    nextInput(msgs) {
      expectTypeOf(msgs).not.toBeNever();
      expectTypeOf(msgs).not.toBeAny();
      expectTypeOf(msgs).toMatchTypeOf<Message[]>();
      return (msgs[msgs.length - 1] as any).id;
    },
  });

  await new Promise((resolve) => ee.once('client:response', resolve));

  ee.once('server:connect', () => {
    setTimeout(() => {
      ee.emit('server:msg', {
        id: '3',
        text: 'again',
      });
    }, 1);
  });

  await new Promise((resolve) => ee.once('client:response', resolve));

  expect(onConnect).toHaveBeenCalledTimes(2);

  expect(allInputs).toMatchInlineSnapshot(`
    Array [
      undefined,
      "2",
    ]
  `);
  expect(allResponses).toMatchInlineSnapshot(`
    Array [
      Array [
        Object {
          "id": "1",
          "text": "hi",
        },
        Object {
          "id": "2",
          "text": "there",
        },
      ],
      Array [
        Object {
          "id": "3",
          "text": "again",
        },
      ],
    ]
  `);

  unsub();
  close();
});
