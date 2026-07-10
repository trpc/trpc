/// <reference types="vitest" />
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { waitError } from '@trpc/server/__tests__/waitError';
import { httpBatchLink, httpLink, TRPCClientError } from '@trpc/client';
import { initTRPC } from '@trpc/server';
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
  test('headers() failure', async () => {
    await using ctx = testServerAndClientResource(appRouter, {
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

    const error = (await waitError(
      ctx.client.q.query('bad'),
      TRPCClientError,
    )) as any as TRPCClientError<typeof appRouter>;

    expect(error).toMatchInlineSnapshot(`[TRPCClientError: Bad headers fn]`);
  });
});

describe('httpBatchLink', () => {
  test('headers() failure', async () => {
    await using ctx = testServerAndClientResource(appRouter, {
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

    const error = (await waitError(
      ctx.client.q.query('bad'),
      TRPCClientError,
    )) as any as TRPCClientError<typeof appRouter>;

    expect(error).toMatchInlineSnapshot(`[TRPCClientError: Bad headers fn]`);
  });
});
