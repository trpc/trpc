import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { initTRPC } from '@trpc/server';

test('allow ;charset=utf-8 after application/json in content-type', async () => {
  const t = initTRPC.create();
  const appRouter = t.router({
    a: t.procedure.query(() => 'a'),
  });

  await using ctx = testServerAndClientResource(appRouter);
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
