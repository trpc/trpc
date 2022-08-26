import { routerToServerAndClientNew } from '../___testHelpers';
import { httpBatchLink, httpLink } from '@trpc/client';
import { konn } from 'konn';
import { initTRPC } from '../../src';

// https://github.com/trpc/trpc/issues/2540
const t = initTRPC()();
const appRouter = t.router({
  q: t.procedure.query(() => {
    return 'good';
  }),
  m: t.procedure.mutation(() => {
    return 'good';
  }),
});

describe('httpLink', () => {
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

  test('query', async () => {
    expect(await ctx.proxy.q.query()).toBe('good');
  });
  test('mutation', async () => {
    expect(await ctx.proxy.m.mutate()).toBe('good');
  });
});

describe('httpBatchLink', () => {
  const ctx = konn()
    .beforeEach(() => {
      const opts = routerToServerAndClientNew(appRouter, {
        client({ httpUrl }) {
          return {
            links: [
              httpBatchLink({
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

  test('query', async () => {
    expect(await ctx.proxy.q.query()).toBe('good');
  });
  test('mutation', async () => {
    expect(await ctx.proxy.m.mutate()).toBe('good');
  });
});
