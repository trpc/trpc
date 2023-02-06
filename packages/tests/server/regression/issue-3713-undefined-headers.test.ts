import { routerToServerAndClientNew } from '../___testHelpers';
import { httpBatchLink, httpLink, splitLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { NodeHTTPCreateContextFnOptions } from '@trpc/server/adapters/node-http';
import { IncomingMessage, ServerResponse } from 'http';
import { konn } from 'konn';

describe('undefined headers sent to server', () => {
  const ctx = konn()
    .beforeEach(() => {
      type Context = NodeHTTPCreateContextFnOptions<
        IncomingMessage,
        ServerResponse<IncomingMessage>
      >;
      const t = initTRPC.context<Context>().create();

      const appRouter = t.router({
        headers: t.procedure.query((opts) => {
          return opts.ctx.req.headers;
        }),
      });
      const headers = {
        undef: undefined,
        notUndef: 'not undefined',
      };

      const opts = routerToServerAndClientNew(appRouter, {
        client(clientOpts) {
          return {
            links: [
              splitLink({
                condition: (op) => !!op.context?.batch,
                true: httpBatchLink({
                  url: clientOpts.httpUrl,
                  headers,
                }),
                false: httpLink({
                  url: clientOpts.httpUrl,
                  headers,
                }),
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
  test('should work', async () => {
    {
      const res = await ctx.proxy.headers.query(undefined, {
        context: {
          batch: true,
        },
      });
      expect(res).not.toHaveProperty('undef');
      expect(res).toHaveProperty('notUndef');
      expect(res.notUndef).toBe('not undefined');
      expect(res).toMatchInlineSnapshot();
    }

    {
      const res = await ctx.proxy.headers.query(undefined, {
        context: {
          batch: false,
        },
      });
      expect(res).not.toHaveProperty('undef');
      expect(res).toHaveProperty('notUndef');
      expect(res.notUndef).toBe('not undefined');
      expect(res).toMatchInlineSnapshot();
    }
  });
});
