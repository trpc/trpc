import { routerToServerAndClientNew } from '../___testHelpers';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create();
    const appRouter = t.router({
      a: t.procedure.query(() => 'a'),
    });

    return routerToServerAndClientNew(appRouter);
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

test('allow ;charset=utf-8 after application/json in content-type', async () => {
  const url = ctx.httpUrl;

  const json = await (
    await fetch(`${url}/a?input={}`, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    })
  ).json();

  expect(json).toMatchInlineSnapshot(`
    Object {
      "result": Object {
        "data": "a",
      },
    }
  `);
});
