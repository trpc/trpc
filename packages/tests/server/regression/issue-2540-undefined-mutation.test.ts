// https://github.com/trpc/trpc/issues/2540
import { routerToServerAndClientNew } from '../___testHelpers';
import { httpBatchLink, httpLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';
import superjson from 'superjson';

describe('no transformer', () => {
  const t = initTRPC.create();
  const appRouter = t.router({
    goodQuery: t.procedure.query(async () => {
      return 'good' as const;
    }),
    goodMutation: t.procedure.mutation(async () => {
      return 'good' as const;
    }),

    voidQuery: t.procedure.query(async () => {
      // void
    }),
    voidMutation: t.procedure.mutation(async () => {
      // void
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

    test('query with response: good', async () => {
      expect(await ctx.client.goodQuery.query()).toBe('good');
    });
    test('query, void response', async () => {
      expect(await ctx.client.voidQuery.query()).toBe(undefined);
    });
    test('mutate with response: good', async () => {
      expect(await ctx.client.goodMutation.mutate()).toBe('good');
    });
    test('mutate, void response', async () => {
      expect(await ctx.client.voidMutation.mutate()).toBe(undefined);
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

    test('query with response: good', async () => {
      expect(await ctx.client.goodQuery.query()).toBe('good');
    });
    test('query, void response', async () => {
      expect(await ctx.client.voidQuery.query()).toBe(undefined);
    });
    test('mutate with response: good', async () => {
      expect(await ctx.client.goodMutation.mutate()).toBe('good');
    });
    test('mutate, void response', async () => {
      expect(await ctx.client.voidMutation.mutate()).toBe(undefined);
    });
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

    test('query with response: good', async () => {
      expect(await ctx.client.goodQuery.query()).toBe('good');
    });
    test('query, void response', async () => {
      expect(await ctx.client.voidQuery.query()).toBe(undefined);
    });
    test('mutate with response: good', async () => {
      expect(await ctx.client.goodMutation.mutate()).toBe('good');
    });
    test('mutate, void response', async () => {
      expect(await ctx.client.voidMutation.mutate()).toBe(undefined);
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

    test('query with response: good', async () => {
      expect(await ctx.client.goodQuery.query()).toBe('good');
    });
    test('query, void response', async () => {
      expect(await ctx.client.voidQuery.query()).toBe(undefined);
    });
    test('mutate with response: good', async () => {
      expect(await ctx.client.goodMutation.mutate()).toBe('good');
    });
    test('mutate, void response', async () => {
      expect(await ctx.client.voidMutation.mutate()).toBe(undefined);
    });
  });
});

describe('with superjson', () => {
  const t = initTRPC.create({
    transformer: superjson,
  });
  const appRouter = t.router({
    goodQuery: t.procedure.query(async () => {
      return 'good' as const;
    }),
    goodMutation: t.procedure.mutation(async () => {
      return 'good' as const;
    }),

    voidQuery: t.procedure.query(async () => {
      // void
    }),
    voidMutation: t.procedure.mutation(async () => {
      // void
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

    test('query with response: good', async () => {
      expect(await ctx.client.goodQuery.query()).toBe('good');
    });
    test('query, void response', async () => {
      expect(await ctx.client.voidQuery.query()).toBe(undefined);
    });
    test('mutate with response: good', async () => {
      expect(await ctx.client.goodMutation.mutate()).toBe('good');
    });
    test('mutate, void response', async () => {
      expect(await ctx.client.voidMutation.mutate()).toBe(undefined);
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

    test('query with response: good', async () => {
      expect(await ctx.client.goodQuery.query()).toBe('good');
    });
    test('query, void response', async () => {
      expect(await ctx.client.voidQuery.query()).toBe(undefined);
    });
    test('mutate with response: good', async () => {
      expect(await ctx.client.goodMutation.mutate()).toBe('good');
    });
    test('mutate, void response', async () => {
      expect(await ctx.client.voidMutation.mutate()).toBe(undefined);
    });
  });
});
