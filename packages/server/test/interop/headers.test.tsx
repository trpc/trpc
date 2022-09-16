/* eslint-disable @typescript-eslint/no-empty-function */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { legacyRouterToServerAndClient } from './__legacyRouterToServerAndClient';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import * as trpc from '../../src';
import { Dict } from '../../src';

test('pass headers', async () => {
  type Context = {
    headers: Dict<string | string[]>;
  };
  const { close, httpUrl } = legacyRouterToServerAndClient(
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
    // no headers sent
    const client = createTRPCClient({
      links: [httpBatchLink({ url: httpUrl })],
    });
    expect(await client.query('hello')).toMatchInlineSnapshot(`Object {}`);
  }

  {
    // custom headers sent
    const client = createTRPCClient({
      links: [
        httpBatchLink({
          url: httpUrl,
          headers() {
            return {
              'X-Special': 'special header',
            };
          },
        }),
      ],
    });
    expect(await client.query('hello')).toMatchInlineSnapshot(`
Object {
  "x-special": "special header",
}
`);
  }
  {
    // async headers
    const client = createTRPCClient({
      links: [
        httpBatchLink({
          url: httpUrl,
          async headers() {
            return {
              'X-Special': 'async special header',
            };
          },
        }),
      ],
    });
    expect(await client.query('hello')).toMatchInlineSnapshot(`
Object {
  "x-special": "async special header",
}
`);
  }
  close();
});
