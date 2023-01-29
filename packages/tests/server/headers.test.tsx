import { routerToServerAndClientNew } from './___testHelpers';
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client/src/index';
import { Dict, initTRPC } from '@trpc/server/src/index';

describe('pass headers', () => {
  type Context = {
    headers: Dict<string | string[]>;
  };

  const t = initTRPC.context<Context>().create();

  const appRouter = t.router({
    hello: t.procedure.query(({ ctx }) => {
      return {
        'x-special': ctx.headers['x-special'],
      };
    }),
  });

  type AppRouter = typeof appRouter;

  const { close, httpUrl } = routerToServerAndClientNew(appRouter, {
    server: {
      createContext(opts) {
        return {
          headers: opts.req.headers,
        };
      },
      // createContext({ req }) {
      //   return { headers: req.headers };
      // },
    },
  });

  afterAll(() => {
    close();
  });

  test('no headers', async () => {
    const client = createTRPCProxyClient<AppRouter>({
      links: [httpBatchLink({ url: httpUrl })],
    });
    expect(await client.hello.query()).toMatchInlineSnapshot(`Object {}`);
  });

  test('custom headers', async () => {
    const client = createTRPCProxyClient<AppRouter>({
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
    expect(await client.hello.query()).toMatchInlineSnapshot(`
Object {
  "x-special": "special header",
}
`);
  });

  test('async headers', async () => {
    const client = createTRPCProxyClient<AppRouter>({
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
    expect(await client.hello.query()).toMatchInlineSnapshot(`
Object {
  "x-special": "async special header",
}
`);
  });
});
