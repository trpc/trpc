import { routerToServerAndClientNew } from '../___testHelpers';
import { httpLink } from '@trpc/client/src';
import { createTRPCReact } from '@trpc/react-query';
import { initTRPC } from '@trpc/server/src';
import { konn } from 'konn';

describe('undefined on server response is inferred on the client', () => {
  const ctx = konn()
    .beforeEach(() => {
      const t = initTRPC.create();
      const appRouter = t.router({
        getNum: t.procedure.query(() => {
          const nums = [1, 2, 3, 4, 5];
          const num = nums.find((n) => n === Math.floor(Math.random() * 10));

          expectTypeOf(num).toEqualTypeOf<number | undefined>();
          return num;
        }),
      });

      return routerToServerAndClientNew(appRouter, {
        client({ httpUrl }) {
          return {
            links: [httpLink({ url: httpUrl })],
          };
        },
      });
    })
    .afterEach(async (ctx) => {
      await ctx?.close?.();
    })
    .done();

  test('using vanilla client', async () => {
    const num = await ctx.proxy.getNum.query();
    expectTypeOf(num).toEqualTypeOf<number | undefined>();
  });

  test('using createCaller', async () => {
    const router = ctx.router;
    const caller = router.createCaller({});
    const num = await caller.getNum();
    expectTypeOf(num).toEqualTypeOf<number | undefined>();
  });

  test('using react hooks', async () => {
    const hooks = createTRPCReact<typeof ctx.router>();
    () => {
      const { data, isSuccess } = hooks.getNum.useQuery();
      if (isSuccess) expectTypeOf(data).toEqualTypeOf<number | undefined>();
      return null;
    };
  });
});
