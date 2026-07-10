import type { IncomingHttpHeaders } from 'http';
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { createTRPCClient, httpBatchLink, httpLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';

describe('pass headers', () => {
  type Context = {
    headers: IncomingHttpHeaders;
  };

  const t = initTRPC.context<Context>().create();

  const appRouter = t.router({
    hello: t.procedure.query((opts) => {
      return {
        'x-special': opts.ctx.headers['x-special'],
      };
    }),
  });

  type AppRouter = typeof appRouter;

  // Local helper function to create test context
  const createTestCtx = () => {
    return testServerAndClientResource(appRouter, {
      server: {
        createContext(opts: any) {
          return {
            headers: opts.req.headers,
          };
        },
      },
    });
  };

  test('no headers', async () => {
    await using ctx = createTestCtx();
    const client = createTRPCClient<AppRouter>({
      links: [httpBatchLink({ url: ctx.httpUrl })],
    });
    expect(await client.hello.query()).toMatchInlineSnapshot(`Object {}`);
  });

  test('custom headers', async () => {
    await using ctx = createTestCtx();
    const client = createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: ctx.httpUrl,
          headers() {
            return {
              'x-special': 'special header',
            };
          },
        }),
      ],
    });
    expect(await client.hello.query()).toMatchInlineSnapshot(`
Object {
  "x-special": "special header",
}
`);
  });

  test('async headers', async () => {
    await using ctx = createTestCtx();
    const client = createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: ctx.httpUrl,
          async headers() {
            return {
              'x-special': 'async special header',
            };
          },
        }),
      ],
    });
    expect(await client.hello.query()).toMatchInlineSnapshot(`
Object {
  "x-special": "async special header",
}
`);
  });

  test('custom headers with context using httpBatchLink', async () => {
    await using ctx = createTestCtx();
    type LinkContext = {
      headers: Record<string, string[] | string>;
    };
    const client = createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: ctx.httpUrl,
          headers(opts) {
            return new Promise((resolve) => {
              resolve({
                'x-special': (opts.opList[0].context as LinkContext).headers[
                  'x-special'
                ],
              });
            });
          },
        }),
      ],
    });

    expect(
      await client.hello.query(undefined, {
        context: {
          headers: {
            'x-special': 'special header',
          },
        },
      }),
    ).toMatchInlineSnapshot(`
      Object {
        "x-special": "special header",
      }
    `);
  });

  test('custom headers with context using httpLink', async () => {
    await using ctx = createTestCtx();
    type LinkContext = {
      headers: Record<string, string[] | string>;
    };
    const client = createTRPCClient<AppRouter>({
      links: [
        httpLink({
          url: ctx.httpUrl,
          headers(opts) {
            return {
              'x-special': (opts.op.context as LinkContext).headers[
                'x-special'
              ],
            };
          },
        }),
      ],
    });

    expect(
      await client.hello.query(undefined, {
        context: {
          headers: {
            'x-special': 'special header',
          },
        },
      }),
    ).toMatchInlineSnapshot(`
      Object {
        "x-special": "special header",
      }
    `);
  });

  test('custom headers with Headers class - httpBatchLink', async () => {
    await using ctx = createTestCtx();
    const client = createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: ctx.httpUrl,
          headers() {
            const heads = new Headers();
            heads.append('x-special', 'special header');
            return heads;
          },
        }),
      ],
    });
    expect(await client.hello.query()).toMatchInlineSnapshot(`
      Object {
        "x-special": "special header",
      }
    `);
  });

  test('custom headers with Headers class - httpLink', async () => {
    await using ctx = createTestCtx();
    const client = createTRPCClient<AppRouter>({
      links: [
        httpLink({
          url: ctx.httpUrl,
          headers() {
            // return { foo: 'bar' };
            return new Headers([['x-special', 'special header']]);
          },
        }),
      ],
    });
    expect(await client.hello.query()).toMatchInlineSnapshot(`
      Object {
        "x-special": "special header",
      }
    `);
  });
});
