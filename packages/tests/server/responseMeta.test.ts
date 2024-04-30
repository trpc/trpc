import type { IncomingMessage, ServerResponse } from 'http';
import { routerToServerAndClientNew } from './___testHelpers';
import { initTRPC } from '@trpc/server';
import fetch from 'node-fetch';

test('set custom headers in beforeEnd', async () => {
  const onError = vi.fn();

  interface Context {
    req: IncomingMessage;
    res: ServerResponse<IncomingMessage>;
  }
  const t = initTRPC.context<Context>().create();

  const appRouter = t.router({
    ['public.q']: t.procedure.query(({}) => {
      return 'public endpoint';
    }),
    nonCachedEndpoint: t.procedure.query(({}) => {
      return 'not cached endpoint';
    }),
  });

  const { close, httpUrl } = routerToServerAndClientNew(appRouter, {
    server: {
      onError,
      responseMeta({ ctx, paths, type, errors }) {
        // assuming you have all your public routes with the keyword `public` in them
        const allPublic = paths?.every((path) => path.includes('public'));
        // checking that no procedures errored
        const allOk = errors.length === 0;
        // checking we're doing a query request
        const isQuery = type === 'query';

        if (ctx?.res && allPublic && allOk && isQuery) {
          // cache request for 1 day + revalidate once every second
          const ONE_DAY_IN_SECONDS = 60 * 60 * 24;
          return {
            headers: new Headers([
              [
                'cache-control',
                `s-maxage=1, stale-while-revalidate=${ONE_DAY_IN_SECONDS}`,
              ],
            ]),
          };
        }
        return {};
      },
    },
  });
  {
    const res = await fetch(`${httpUrl}/public.q`);

    expect(await res.json()).toMatchInlineSnapshot(`
Object {
  "result": Object {
    "data": "public endpoint",
  },
}
`);

    expect(res.headers.get('cache-control')).toMatchInlineSnapshot(
      `"s-maxage=1, stale-while-revalidate=86400"`,
    );
  }
  {
    const res = await fetch(`${httpUrl}/nonCachedEndpoint`);

    expect(await res.json()).toMatchInlineSnapshot(`
Object {
  "result": Object {
    "data": "not cached endpoint",
  },
}
`);

    expect(res.headers.get('cache-control')).toBeNull();
  }

  await close();
});

test('cookie headers', async () => {
  const onError = vi.fn();

  interface Context {
    req: IncomingMessage;
    res: ServerResponse<IncomingMessage>;
  }
  const t = initTRPC.context<Context>().create();

  const appRouter = t.router({
    cookieEndpoint: t.procedure.query(() => {
      return 'cookie endpoint';
    }),
  });

  const { close, httpUrl } = routerToServerAndClientNew(appRouter, {
    server: {
      onError,
      responseMeta() {
        return {
          headers: new Headers([
            ['Set-Cookie', 'a=b'],
            ['Set-Cookie', 'b=c'],
          ]),
        };
      },
    },
  });

  {
    const res = await fetch(`${httpUrl}/cookieEndpoint`);

    expect(res.headers.get('set-cookie')).toMatchInlineSnapshot(`
"a=b, b=c"
`);

    expect(await res.json()).toMatchInlineSnapshot(`
Object {
  "result": Object {
    "data": "cookie endpoint",
  },
}
`);
  }

  await close();
});

describe('deprecated headers object', () => {
  test('set custom headers in beforeEnd', async () => {
    const onError = vi.fn();

    interface Context {
      req: IncomingMessage;
      res: ServerResponse<IncomingMessage>;
    }
    const t = initTRPC.context<Context>().create();

    const appRouter = t.router({
      ['public.q']: t.procedure.query(({}) => {
        return 'public endpoint';
      }),
      nonCachedEndpoint: t.procedure.query(({}) => {
        return 'not cached endpoint';
      }),
    });

    const { close, httpUrl } = routerToServerAndClientNew(appRouter, {
      server: {
        onError,
        responseMeta({ ctx, paths, type, errors }) {
          // assuming you have all your public routes with the keyword `public` in them
          const allPublic = paths?.every((path) => path.includes('public'));
          // checking that no procedures errored
          const allOk = errors.length === 0;
          // checking we're doing a query request
          const isQuery = type === 'query';

          if (ctx?.res && allPublic && allOk && isQuery) {
            // cache request for 1 day + revalidate once every second
            const ONE_DAY_IN_SECONDS = 60 * 60 * 24;
            return {
              headers: {
                'cache-control': `s-maxage=1, stale-while-revalidate=${ONE_DAY_IN_SECONDS}`,
              },
            };
          }
          return {};
        },
      },
    });
    {
      const res = await fetch(`${httpUrl}/public.q`);

      expect(await res.json()).toMatchInlineSnapshot(`
Object {
  "result": Object {
    "data": "public endpoint",
  },
}
`);

      expect(res.headers.get('cache-control')).toMatchInlineSnapshot(
        `"s-maxage=1, stale-while-revalidate=86400"`,
      );
    }
    {
      const res = await fetch(`${httpUrl}/nonCachedEndpoint`);

      expect(await res.json()).toMatchInlineSnapshot(`
Object {
  "result": Object {
    "data": "not cached endpoint",
  },
}
`);

      expect(res.headers.get('cache-control')).toBeNull();
    }

    await close();
  });

  test('cookie headers', async () => {
    const onError = vi.fn();

    interface Context {
      req: IncomingMessage;
      res: ServerResponse<IncomingMessage>;
    }
    const t = initTRPC.context<Context>().create();

    const appRouter = t.router({
      cookieEndpoint: t.procedure.query(() => {
        return 'cookie endpoint';
      }),
    });

    const { close, httpUrl } = routerToServerAndClientNew(appRouter, {
      server: {
        onError,
        responseMeta() {
          return {
            headers: {
              'Set-Cookie': ['a=b', 'b=c'],
            },
          };
        },
      },
    });

    {
      const res = await fetch(`${httpUrl}/cookieEndpoint`);

      expect(res.headers.get('set-cookie')).toMatchInlineSnapshot(`
"a=b, b=c"
`);

      expect(await res.json()).toMatchInlineSnapshot(`
Object {
  "result": Object {
    "data": "cookie endpoint",
  },
}
`);
    }

    await close();
  });
});
