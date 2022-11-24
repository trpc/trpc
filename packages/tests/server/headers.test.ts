import { routerToServerAndClientNew } from './___testHelpers';
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { Dict } from '@trpc/server';

describe('pass headers', () => {
  type Context = {
    headers: Dict<string | string[]>;
  };
  const t = initTRPC.context<Context>().create();

  const { procedure } = t;

  const router = t.router({
    greeting: procedure.query(({ ctx }) => {
      return {
        'x-special': ctx.headers['x-special'],
      };
    }),
  });
  const { close, httpUrl } = routerToServerAndClientNew(router, {
    server: {
      createContext: ({ req }) => {
        return {
          headers: req.headers,
        };
      },
    },
  });

  afterAll(() => {
    close();
  });

  test('no headers', async () => {
    const client = createTRPCProxyClient<typeof router>({
      links: [httpBatchLink({ url: httpUrl })],
    });
    const res = await client.greeting.query();
    expect(res).toEqual({
      'x-special': undefined,
    });
  });

  test('custom headers', async () => {
    const client = createTRPCProxyClient<typeof router>({
      links: [
        httpBatchLink({
          url: httpUrl,
          headers: { 'X-special': 'special header' },
        }),
      ],
    });
    const res = await client.greeting.query();
    expect(res).toEqual({
      'x-special': 'special header',
    });
  });

  test('async headers', async () => {
    const client = createTRPCProxyClient<typeof router>({
      links: [
        httpBatchLink({
          url: httpUrl,
          headers: async () => {
            return { 'X-special': 'async special header' };
          },
        }),
      ],
    });
    const res = await client.greeting.query();
    expect(res).toEqual({
      'x-special': 'async special header',
    });
  });
});
