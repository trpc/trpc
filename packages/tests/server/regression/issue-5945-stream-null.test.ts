import { routerToServerAndClientNew } from '../___testHelpers';
import { unstable_httpBatchStreamLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';
import superjson from 'superjson';

describe('without transformer', () => {
  const ctx = konn()
    .beforeEach(() => {
      const t = initTRPC.create();
      const appRouter = t.router({
        returnNull: t.procedure.query(() => {
          return null;
        }),
        returnUndefined: t.procedure.query(() => {
          return undefined;
        }),
        returnString: t.procedure.query(() => {
          return 'hello';
        }),
      });

      return routerToServerAndClientNew(appRouter, {
        client({ httpUrl }) {
          return {
            links: [unstable_httpBatchStreamLink({ url: httpUrl })],
          };
        },
      });
    })
    .afterEach(async (ctx) => {
      await ctx?.close?.();
    })
    .done();

  test('return string', async () => {
    expect(await ctx.client.returnString.query()).toBe('hello');
  });

  test('return null', async () => {
    expect(await ctx.client.returnNull.query()).toBe(null);
  });

  test('return undefined', async () => {
    expect(await ctx.client.returnUndefined.query()).toBe(undefined);
  });
});

describe('with transformer', () => {
  const ctx = konn()
    .beforeEach(() => {
      const t = initTRPC.create({
        transformer: superjson,
      });
      const appRouter = t.router({
        returnNull: t.procedure.query(() => {
          return null;
        }),
        returnUndefined: t.procedure.query(() => {
          return undefined;
        }),
        returnString: t.procedure.query(() => {
          return 'hello';
        }),
      });

      return routerToServerAndClientNew(appRouter, {
        client({ httpUrl }) {
          return {
            links: [
              unstable_httpBatchStreamLink({
                url: httpUrl,
                transformer: superjson,
              }),
            ],
          };
        },
      });
    })
    .afterEach(async (ctx) => {
      await ctx?.close?.();
    })
    .done();

  test('return string', async () => {
    expect(await ctx.client.returnString.query()).toBe('hello');
  });

  test('return null', async () => {
    expect(await ctx.client.returnNull.query()).toBe(null);
  });

  test('return undefined', async () => {
    expect(await ctx.client.returnUndefined.query()).toBe(undefined);
  });
});
