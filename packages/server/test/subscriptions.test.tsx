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
      });
      ee.emit('server:msg', {
        id: '2',
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
  const TIMEOUT_MS = 100;
  const ee = new EventEmitter();
  type Message = {
    id: string;
  };

  const allInputs: unknown[] = [];
  const onConnect = jest.fn(() => {
    ee.emit('server:connect');
  });
  const { client, close } = routerToServerAndClient(
    trpc.router().subscription('onMessage', {
      input: z.string().optional(),
      resolve({ input }) {
        allInputs.push(input);
        onConnect();
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
        requestTimeoutMs: TIMEOUT_MS,
      },
    },
  );
  ee.once('server:connect', () => {
    setTimeout(() => {
      ee.emit('server:msg', {
        id: '1',
      });
      ee.emit('server:msg', {
        id: '2',
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
      });
    }, 1);
  });

  await new Promise((resolve) => ee.once('client:response', resolve));

  expect(onConnect).toHaveBeenCalledTimes(2);

  // let request timeout
  await new Promise((resolve) => setTimeout(resolve, TIMEOUT_MS + 1));

  ee.once('server:connect', () => {
    setTimeout(() => {
      ee.emit('server:msg', {
        id: '4',
      });
    }, 1);
  });

  await new Promise((resolve) => ee.once('client:response', resolve));
  await new Promise((resolve) => ee.once('server:connect', resolve));

  expect(allInputs).toEqual([
    undefined,
    '2',
    '3',
    '3', // <-- this is because of the reconnect
    '4',
  ]);

  expect(allResponses).toMatchInlineSnapshot(`
    Array [
      Array [
        Object {
          "id": "1",
        },
        Object {
          "id": "2",
        },
      ],
      Array [
        Object {
          "id": "3",
        },
      ],
      Array [
        Object {
          "id": "4",
        },
      ],
    ]
  `);
  unsub();
  close();
});
