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

  const normalResult = (await fetch(`${url}/a,b`)).json();
  const uriEncodedResult = (await fetch(`${url}/a%2Cb`)).json();

  expect(normalResult).toEqual(uriEncodedResult);
});
