import { routerToServerAndClientNew, waitError } from '../___testHelpers';
import { TRPCClientError, httpLink } from '@trpc/client';
import { konn } from 'konn';
import { z } from 'zod';
import { initTRPC } from '../../src';

const t = initTRPC()();
const appRouter = t.router({
  q: t.procedure.input(z.enum(['good', 'bad'])).query(({ input }) => {
    if (input === 'bad') {
      throw new Error('Bad');
    }
    return 'good';
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
          headers() {
            throw new Error('Bad headers fn');
          },
        };
      },
    });

    return opts;
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

test('httpLink failure', async () => {
  const error = (await waitError(
    ctx.proxy.q.query('bad'),
    TRPCClientError,
  )) as any as TRPCClientError<typeof appRouter>;

  expect(error).toMatchInlineSnapshot(`[TRPCClientError: Bad headers fn]`);
});
