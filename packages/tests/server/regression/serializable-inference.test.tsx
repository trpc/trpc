import { routerToServerAndClientNew } from '../___testHelpers';
import { httpLink } from '@trpc/client';
import type { inferRouterOutputs } from '@trpc/server';
import { initTRPC } from '@trpc/server';
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
    const { client } = ctx;

    type Output = inferRouterOutputs<typeof appRouter>['greeting'];
    expectTypeOf<Output>().toEqualTypeOf<{
      message: string;
      date: string;
    }>();

    const res = await client.greeting.query();
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
            links: [
              httpLink({
                url: httpUrl,
                transformer: superjson,
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
    const { client } = ctx;

    type Output = inferRouterOutputs<typeof appRouter>['greeting'];
    expectTypeOf<Output>().toEqualTypeOf<{
      message: string;
      date: Date;
    }>();

    const res = await client.greeting.query();
    expectTypeOf(res).toEqualTypeOf<{
      message: string;
      date: Date;
    }>();
  });
});
