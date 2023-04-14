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
        getObj: t.procedure.query(() => {
          const objs = [{ id: 1 } as { id: number | undefined }];
          const obj = objs.find((n) => n.id === Math.floor(Math.random() * 5));
          //    ^?
          return obj;
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

    const obj = await ctx.proxy.getObj.query();
    // key might be stripped entirely   👇, or value should be defined
    expectTypeOf(obj).toEqualTypeOf<{ id?: number } | undefined>();
  });

  test('using createCaller', async () => {
    const router = ctx.router;
    const caller = router.createCaller({});
    const num = await caller.getNum();
    expectTypeOf(num).toEqualTypeOf<number | undefined>();

    const obj = await caller.getObj();
    // key should not be stripped       👇, since we're not calling JSON.stringify/parse on createCaller, value can be undefined though
    expectTypeOf(obj).toEqualTypeOf<{ id: number | undefined } | undefined>();
  });

  test('using react hooks', async () => {
    const hooks = createTRPCReact<typeof ctx.router>();
    () => {
      const { data: num, isSuccess: numSuccess } = hooks.getNum.useQuery();
      if (numSuccess) expectTypeOf(num).toEqualTypeOf<number | undefined>();

      const { data: obj, isSuccess: objSuccess } = hooks.getObj.useQuery();
      if (objSuccess)
        expectTypeOf(obj).toEqualTypeOf<{ id?: number } | undefined>();

      return null;
    };
  });
});
