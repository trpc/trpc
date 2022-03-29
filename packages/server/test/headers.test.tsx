/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
import { createTRPCClient } from '../../client/src';
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
        // return only custom headers
        return Object.keys(ctx.headers).reduce((acc, key) => {
          if (key.startsWith('x-')) {
            return { ...acc, [key]: ctx.headers[key] };
          }
          return acc;
        }, {});
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
      url: httpUrl,
    });
    expect(await client.query('hello')).toMatchInlineSnapshot(`Object {}`);
  }

  {
    // custom headers sent
    const client = createTRPCClient({
      url: httpUrl,
      headers() {
        return {
          'X-Special': 'special header',
        };
      },
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
      url: httpUrl,
      async headers() {
        return {
          'X-Special': 'async special header',
        };
      },
    });
    expect(await client.query('hello')).toMatchInlineSnapshot(`
Object {
  "x-special": "async special header",
}
`);
  }
  {
    // remove undefined headers
    const client = createTRPCClient({
      url: httpUrl,
      headers: {
        'x-defined': 'xyz',
        'x-undefined': undefined,
      },
    });
    expect(await client.query('hello')).toMatchInlineSnapshot(`
Object {
  "x-defined": "xyz",
}
`);
  }
  close();
});
