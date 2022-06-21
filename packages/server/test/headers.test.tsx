/* eslint-disable @typescript-eslint/no-empty-function */

/* eslint-disable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/ban-types */
import { routerToServerAndClient } from './__testHelpers';
import { createTRPCClient } from '../../client/src';
import { httpBatchLink } from '../../client/src/links/httpBatchLink';
import { httpLink } from '../../client/src/links/httpLink';
import { splitLink } from '../../client/src/links/splitLink';
import * as trpc from '../src';
import { Dict } from '../src';

test('pass headers', async () => {
  type Context = {
    headers: Dict<string | string[]>;
  };
  const { close, httpUrl } = routerToServerAndClient(
    trpc.router<Context>().query('hello', {
      resolve({ ctx }) {
        const xHeaders: Record<string, unknown> = {};
        Object.entries(ctx.headers)
          .filter(([key]) => key.startsWith('x'))
          .forEach(([key, value]) => {
            xHeaders[key] = value;
          });
        return xHeaders;
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
    // array headers
    const client = createTRPCClient({
      url: httpUrl,
      headers: {
        'x-special': ['foo', 'bar'],
      },
    });
    expect(await client.query('hello')).toMatchInlineSnapshot(`
      Object {
        "x-special": "foo,bar",
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

  {
    // aconditional header batch link
    const client = createTRPCClient({
      url: httpUrl,
      async headers() {
        return {
          'x-1': '1',
          'x-2': '2',
          'x-3': '3',
        };
      },
      links: [
        splitLink({
          condition: (op) => op.context.batch === true,

          true: httpBatchLink({
            url: httpUrl,
            headers: () => {
              return {
                'x-batch': '1',
              };
            },
          }),
          false: httpLink({
            url: httpUrl,
            headers: ({ op }) => {
              return (op.context as any)?.headers;
            },
          }),
        }),
      ],
    });
    expect(
      await client.query('hello', undefined, {
        context: {
          headers: {
            'x-3': 'overriden',
          },
        },
      }),
    ).toMatchInlineSnapshot(`
      Object {
        "x-1": "1",
        "x-2": "2",
        "x-3": "overriden",
      }
    `);

    expect(
      await client.query('hello', undefined, {
        context: {
          batch: true,
          headers: {
            'x-3': 'i-will-not-make-it',
          },
        },
      }),
    ).toMatchInlineSnapshot(`
      Object {
        "x-1": "1",
        "x-2": "2",
        "x-3": "3",
        "x-batch": "1",
      }
    `);
  }
  close();
});
