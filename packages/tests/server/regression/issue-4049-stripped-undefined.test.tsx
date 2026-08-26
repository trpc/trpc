/// <reference types="vitest" />
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { httpLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import { initTRPC } from '@trpc/server';

describe('undefined on server response is inferred on the client', () => {
  const t = initTRPC.create();
  const appRouter = t.router({
    num: t.procedure.query(() => {
      const nums = [1, 2, 3, 4, 5];
      const num = nums.find((n) => n === Math.floor(Math.random() * 10));
      expectTypeOf(num).toEqualTypeOf<number | undefined>();
      return num;
    }),
    obj: t.procedure.query(() => {
      const objs = [{ id: 1 } as { id: number | undefined }];
      const obj = objs.find((n) => n.id === Math.floor(Math.random() * 5));
      expectTypeOf(obj).toEqualTypeOf<{ id: number | undefined } | undefined>();
      return obj;
    }),
    und: t.procedure.query(() => {
      return undefined;
    }),
  });

  test('using vanilla client', async () => {
    await using ctx = testServerAndClientResource(appRouter, {
      client({ httpUrl }) {
        return { links: [httpLink({ url: httpUrl })] };
      },
    });

    const num = await ctx.client.num.query();
    expectTypeOf(num).toEqualTypeOf<number | undefined>();

    const obj = await ctx.client.obj.query();
    expectTypeOf(obj).toEqualTypeOf<{ id?: number } | undefined>();

    const und = await ctx.client.und.query();
    expectTypeOf(und).toEqualTypeOf<undefined>();
  });

  test('using createCaller', async () => {
    const caller = appRouter.createCaller({});
    const num = await caller.num();
    expectTypeOf(num).toEqualTypeOf<number | undefined>();

    const obj = await caller.obj();
    expectTypeOf(obj).toEqualTypeOf<{ id: number | undefined } | undefined>();

    const und = await caller.und();
    expectTypeOf(und).toEqualTypeOf<undefined>();
  });

  test('using react hooks', async () => {
    const hooks = createTRPCReact<typeof appRouter>();
    () => {
      const { data: num, isSuccess: numSuccess } = hooks.num.useQuery();
      if (numSuccess) expectTypeOf(num).toEqualTypeOf<number | undefined>();

      const { data: obj, isSuccess: objSuccess } = hooks.obj.useQuery();
      if (objSuccess)
        expectTypeOf(obj).toEqualTypeOf<{ id?: number } | undefined>();

      const { data: und, isSuccess: undSuccess } = hooks.und.useQuery();
      if (undSuccess) expectTypeOf(und).toEqualTypeOf<undefined>();

      return null;
    };
  });
});
