import * as trpc from '@trpc/server';
import superjson from 'superjson';
import devalue from 'devalue';
import { z } from 'zod';
import { routerToServerAndClient } from './_testHelpers';

test('superjson up and down', async () => {
  const transformer = superjson;

  const date = new Date();
  const fn = jest.fn();
  const { client, close } = routerToServerAndClient(
    trpc.router().query('hello', {
      input: z.date(),
      resolve({ input }) {
        fn(input);
        return input;
      },
    }),
    {
      client: { transformer },
      server: { transformer },
    },
  );
  const res = await client.query('hello', date);
  expect(res.getTime()).toBe(date.getTime());
  expect((fn.mock.calls[0][0] as Date).getTime()).toBe(date.getTime());

  close();
});

test('devalue up and down', async () => {
  const transformer: trpc.DataTransformer = {
    serialize: (object) => devalue(object),
    deserialize: (object) => eval(`(${object})`),
  };

  const date = new Date();
  const fn = jest.fn();
  const { client, close } = routerToServerAndClient(
    trpc.router().query('hello', {
      input: z.date(),
      resolve({ input }) {
        fn(input);
        return input;
      },
    }),
    {
      client: { transformer },
      server: { transformer },
    },
  );
  const res = await client.query('hello', date);
  expect(res.getTime()).toBe(date.getTime());
  expect((fn.mock.calls[0][0] as Date).getTime()).toBe(date.getTime());

  close();
});
