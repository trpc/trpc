/// <reference types="vitest" />
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { httpLink } from '@trpc/client';
import type { inferRouterOutputs } from '@trpc/server';
import { initTRPC } from '@trpc/server';
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

  test('output', async () => {
    await using ctx = testServerAndClientResource(appRouter, {
      client({ httpUrl }) {
        return {
          links: [httpLink({ url: httpUrl })],
        };
      },
    });

    type Output = inferRouterOutputs<typeof appRouter>['greeting'];
    expectTypeOf<Output>().toEqualTypeOf<{
      message: string;
      date: string;
    }>();

    const res = await ctx.client.greeting.query();
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

  test('output', async () => {
    await using ctx = testServerAndClientResource(appRouter, {
      client({ httpUrl }) {
        return {
          links: [httpLink({ url: httpUrl, transformer: superjson })],
        };
      },
    });

    type Output = inferRouterOutputs<typeof appRouter>['greeting'];
    expectTypeOf<Output>().toEqualTypeOf<{
      message: string;
      date: Date;
    }>();

    const res = await ctx.client.greeting.query();
    expectTypeOf(res).toEqualTypeOf<{
      message: string;
      date: Date;
    }>();
  });
});
