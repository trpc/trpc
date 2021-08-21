/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/no-unused-vars */
import fetch from 'node-fetch';
import * as trpc from '../src';
import { routerToServerAndClient } from './_testHelpers';
test('duplicate beforeEnd', () => {
  expect(() =>
    trpc
      .router()
      .beforeEnd(() => {})
      .beforeEnd(() => {}),
  ).toThrowErrorMatchingInlineSnapshot(
    `"You seem to have double \`beforeEnd()\`-calls in your router tree"`,
  );
});

test('set custom headers in beforeEnd', async () => {
  const onError = jest.fn();
  const { close, httpUrl } = routerToServerAndClient(
    trpc
      .router<trpc.CreateHttpContextOptions>()
      .beforeEnd(({ ctx, paths }) => {
        expect(ctx).toBeTruthy();
        expect(paths).toBeTruthy();
        expect(paths).toMatchInlineSnapshot(`
Array [
  "q",
]
`);
        if (ctx?.res) {
          ctx.res.setHeader('x-whois', 'alexdotjs');
        }
      })
      .query('q', {
        resolve() {
          return null;
        },
      }),
    {
      server: {
        onError,
      },
    },
  );
  const res = await fetch(`${httpUrl}/q`);

  expect(await res.json()).toMatchInlineSnapshot(`
Object {
  "id": null,
  "result": Object {
    "data": null,
    "type": "data",
  },
}
`);

  expect(res.headers.get('x-whois')).toBe('alexdotjs');

  close();
});
