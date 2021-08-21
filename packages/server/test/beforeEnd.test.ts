/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/no-unused-vars */
import fetch from 'node-fetch';
import * as trpc from '../src';
import { routerToServerAndClient } from './_testHelpers';

test('set custom headers in beforeEnd', async () => {
  const onError = jest.fn();
  const { close, httpUrl } = routerToServerAndClient(
    trpc
      .router<trpc.CreateHttpContextOptions>()
      .query('public.q', {
        resolve() {
          return 'public endpoint';
        },
      })
      .query('nonCachedEndpoint', {
        resolve() {
          return 'not cached endpoint';
        },
      }),
    {
      server: {
        onError,
        beforeEnd({ ctx, paths, data, type }) {
          // assuming you have all your public routes with the kewyord `public` in them
          const allPublic =
            paths && paths.every((path) => path.includes('public'));
          // checking that no responses contains an error
          const allOk = data.every((data) => 'result' in data);
          // checking we're doing a query request
          const isQuery = type === 'query';

          if (ctx?.res && allPublic && allOk && isQuery) {
            // cache request for 1 day + revalidate once every second
            const ONE_DAY_IN_SECONDS = 60 * 60 * 24;
            ctx.res.setHeader(
              'Cache-Control',
              `s-maxage=1, stale-while-revalidate=${ONE_DAY_IN_SECONDS}`,
            );
          }
        },
      },
    },
  );
  {
    const res = await fetch(`${httpUrl}/public.q`);

    expect(await res.json()).toMatchInlineSnapshot(`
Object {
  "id": null,
  "result": Object {
    "data": "public endpoint",
    "type": "data",
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
  "id": null,
  "result": Object {
    "data": "not cached endpoint",
    "type": "data",
  },
}
`);

    expect(res.headers.get('cache-control')).toBeNull();
  }

  close();
});
