import * as trpc from '@trpc/server';
import superjson from 'superjson';
import { z } from 'zod';
import { routerToServerAndClient } from './_testHelpers';

test('superjson up and down', async () => {
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
      client: { transformer: superjson },
      server: { transformer: superjson },
    },
  );
  const res = await client.query('hello', date);
  expect(res.getTime()).toBe(date.getTime());
  expect((fn.mock.calls[0][0] as Date).getTime()).toBe(date.getTime());

  close();
});
