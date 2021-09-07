/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
import { createTRPCClient } from '@trpc/client';
import * as trpc from '../src';
import { Dict } from '../src';
import { routerToServerAndClient } from './_testHelpers';

test('pass headers', async () => {
  type Context = {
    headers: Dict<string | string[]>;
  };
  const { close, httpUrl } = routerToServerAndClient(
    trpc.router<Context>().query('hello', {
      resolve({ ctx }) {
        return {
          'x-special': ctx.headers['x-special'],
        };
      },
    }),
    {
      server: {
        createContext({ req }) {
          return { headers: req.headers };
        },
      },
    },
  );
  {
    const client = createTRPCClient({
      url: httpUrl,
    });
    expect(await client.query('hello')).toMatchInlineSnapshot(`Object {}`);
  }
  {
    const client = createTRPCClient({
      url: httpUrl,
      headers() {
        return {
          'X-Special': 'special header o/',
        };
      },
    });
    expect(await client.query('hello')).toMatchInlineSnapshot(`
Object {
  "x-special": "special header o/",
}
`);
  }
  close();
});
