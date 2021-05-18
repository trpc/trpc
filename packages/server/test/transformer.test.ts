import * as trpc from '@trpc/server';
import superjson from 'superjson';
import { routerToServerAndClient } from './_testHelpers';

test('superjson downstream', async () => {
  const date = new Date();
  const { client, close } = routerToServerAndClient(
    trpc.router().query('hello', {
      resolve() {
        return {
          date,
        };
      },
    }),
    {
      client: { transformer: superjson },
      server: { transformer: superjson },
    },
  );
  const res = await client.query('hello');
  expect(res.date.getTime()).toBe(date.getTime());

  close();
});
