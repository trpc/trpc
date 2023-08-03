import { routerToServerAndClientNew } from '../___testHelpers';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create();
    const appRouter = t.router({
      a: t.procedure.query(() => 'a'),
      b: t.procedure.query(() => 'b'),
    });

    return routerToServerAndClientNew(appRouter);
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

test('preserve `.cause` even on non-error objects', async () => {
  const url = ctx.httpUrl;

  const normalResult = await (
    await fetch(`${url}/a,b?batch=1&input={}`)
  ).json();
  const uriEncodedResult = await (
    await fetch(`${url}/a%2Cb?batch=1&input={}`)
  ).json();

  expect(normalResult).toMatchInlineSnapshot(`
    Array [
      Object {
        "result": Object {
          "data": "a",
        },
      },
      Object {
        "result": Object {
          "data": "b",
        },
      },
    ]
  `);
  expect(normalResult).toEqual(uriEncodedResult);
});
