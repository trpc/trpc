import { routerToServerAndClientNew } from '../___testHelpers';
import { httpLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';
import { z } from 'zod';

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create();
    const appRouter = t.router({
      test: t.procedure
        .input(
          z.object({
            foo: z.literal('bar'),
          }),
        )
        .mutation((opts) => opts.input.foo),
    });

    return routerToServerAndClientNew(appRouter, {
      client({ httpUrl }) {
        return {
          links: [httpLink({ url: httpUrl })],
        };
      },
    });
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

test('POST w/o specifying content-type should work', async () => {
  const body = JSON.stringify({
    foo: 'bar',
  });
  const url = `${ctx.httpUrl}/test`;

  {
    const res = await fetch(url, {
      method: 'POST',
      body,
      headers: {
        'content-type': 'application/json',
      },
    });
    expect(res.ok).toBe(true);
    expect(await res.json()).toMatchInlineSnapshot(`
      Object {
        "result": Object {
          "data": "bar",
        },
      }
    `);
  }
  {
    const res = await fetch(url, {
      method: 'POST',
      body,
    });
    expect(res.ok).toBe(true);
    expect(await res.json()).toMatchInlineSnapshot(`
      Object {
        "result": Object {
          "data": "bar",
        },
      }
    `);
  }
});
