/* eslint-disable @typescript-eslint/no-empty-function */

/* eslint-disable @typescript-eslint/no-unused-vars */
import { routerToServerAndClientNew } from './___testHelpers';
import { initTRPC } from '@trpc/server/src';
import fetch from 'node-fetch';

test('set custom headers in beforeEnd', async () => {
  const onError = jest.fn();

  const t = initTRPC.context().create();

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
        // assuming you have all your public routes with the kewyord `public` in them
        const allPublic =
          paths && paths.every((path) => path.includes('public'));
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

  close();
});
