/* eslint-disable @typescript-eslint/no-empty-function */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { legacyRouterToServerAndClient } from './__legacyRouterToServerAndClient';
import { createTRPCClient, httpBatchLink } from '@trpc/client/src';
import * as trpc from '@trpc/server/src';
import { Dict } from '@trpc/server/src';

describe('pass headers', () => {
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

  afterAll(() => {
    close();
  });

  test('no headers', async () => {
    const client = createTRPCClient({
      links: [httpBatchLink({ url: httpUrl })],
    });
    expect(await client.query('hello')).toMatchInlineSnapshot(`Object {}`);
  });

  test('custom headers', async () => {
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
  });

  test('async headers', async () => {
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
  });
});
