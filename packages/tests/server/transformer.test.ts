import { routerToServerAndClientNew, waitError } from './___testHelpers';
import { TRPCClientError } from '@trpc/client/src';
import { AnyRouter, DefaultErrorShape, initTRPC } from '@trpc/server/src';
import { DefaultErrorData } from '@trpc/server/src/error/formatter';
import { expectTypeOf } from 'expect-type';
import { konn } from 'konn';
import superjson from 'superjson';

describe('superjson happy path', () => {
  const t = initTRPC.create({
    transformer: superjson,
  });

  const appRouter = t.router({
    greeting: t.procedure.query(() => {
      return {
        now: new Date(),
      };
    }),
  });
  const ctx = konn()
    .beforeEach(() => {
      const opts = routerToServerAndClientNew(appRouter, {
        client: {
          transformer: superjson,
        },
      });

      return opts;
    })
    .afterEach(async (ctx) => {
      await ctx?.close?.();
    })
    .done();

  test('works', async () => {
    const result = await ctx.proxy.greeting.query();

    expect(result.now).toBeInstanceOf(Date);
  });
});
