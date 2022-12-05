import { routerToServerAndClientNew } from '../___testHelpers';
import { httpLink } from '@trpc/client';
import { inferRouterOutputs, initTRPC } from '@trpc/server/src';
import { expectTypeOf } from 'expect-type';
import { konn } from 'konn';
import superjson from 'superjson';

describe('without transformer', () => {
  const t = initTRPC.create();
  const appRouter = t.router({
    greeting: t.procedure.query(() => {
      return {
        message: 'hello',
        date: new Date(),
      };
    }),
  });
  const ctx = konn()
    .beforeEach(() => {
      const opts = routerToServerAndClientNew(appRouter, {
        client({ httpUrl }) {
          return {
            links: [
              httpLink({
                url: httpUrl,
              }),
            ],
          };
        },
      });

      return opts;
    })
    .afterEach(async (ctx) => {
      await ctx?.close?.();
    })
    .done();

  test('output', async () => {
    const { proxy } = ctx;

    type Output = inferRouterOutputs<typeof appRouter>['greeting'];
    expectTypeOf<Output>().toEqualTypeOf<{
      message: string;
      date: string;
    }>();

    const res = await proxy.greeting.query();
    expectTypeOf(res).toEqualTypeOf<{
      message: string;
      date: string;
    }>();
  });
});

describe('with transformer', () => {
  const t = initTRPC.create({
    transformer: superjson,
  });
  const appRouter = t.router({
    greeting: t.procedure.query(() => {
      return {
        message: 'hello',
        date: new Date(),
      };
    }),
  });
  const ctx = konn()
    .beforeEach(() => {
      const opts = routerToServerAndClientNew(appRouter, {
        client({ httpUrl }) {
          return {
            transformer: superjson,
            links: [
              httpLink({
                url: httpUrl,
              }),
            ],
          };
        },
      });

      return opts;
    })
    .afterEach(async (ctx) => {
      await ctx?.close?.();
    })
    .done();

  test('output', async () => {
    const { proxy } = ctx;

    type Output = inferRouterOutputs<typeof appRouter>['greeting'];
    expectTypeOf<Output>().toEqualTypeOf<{
      message: string;
      date: Date;
    }>();

    const res = await proxy.greeting.query();
    expectTypeOf(res).toEqualTypeOf<{
      message: string;
      date: Date;
    }>();
  });
});
