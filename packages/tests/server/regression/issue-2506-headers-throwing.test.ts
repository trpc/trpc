import { routerToServerAndClientNew, waitError } from '../___testHelpers';
import { httpBatchLink, httpLink, TRPCClientError } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';
import { z } from 'zod';

const t = initTRPC.create();
const appRouter = t.router({
  q: t.procedure.input(z.enum(['good', 'bad'])).query(({ input }) => {
    if (input === 'bad') {
      throw new Error('Bad');
    }
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
                headers() {
                  throw new Error('Bad headers fn');
                },
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

  test('headers() failure', async () => {
    const error = (await waitError(
      ctx.client.q.query('bad'),
      TRPCClientError,
    )) as any as TRPCClientError<typeof appRouter>;

    expect(error).toMatchInlineSnapshot(`[TRPCClientError: Bad headers fn]`);
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
                headers() {
                  throw new Error('Bad headers fn');
                },
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

  test('headers() failure', async () => {
    const error = (await waitError(
      ctx.client.q.query('bad'),
      TRPCClientError,
    )) as any as TRPCClientError<typeof appRouter>;

    expect(error).toMatchInlineSnapshot(`[TRPCClientError: Bad headers fn]`);
  });
});
