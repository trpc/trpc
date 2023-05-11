import { routerToServerAndClientNew } from './___testHelpers';
import { TRPCLink, httpLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { konn } from 'konn';
import { z } from 'zod';

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create({});

    const router = t.router({
      deferred: t.procedure
        .input(
          z.object({
            wait: z.number(),
          }),
        )
        .query(async (opts) => {
          await new Promise<void>((resolve) =>
            setTimeout(resolve, opts.input.wait),
          );
          return `waited ${opts.input.wait}ms`;
        }),
    });

    const linkSpy: TRPCLink<typeof router> = () => {
      // here we just got initialized in the app - this happens once per app
      // useful for storing cache for instance
      return ({ next, op }) => {
        // this is when passing the result to the next link
        // each link needs to return an observable which propagates results
        return observable((observer) => {
          console.log('performing operation:', op);
          const unsubscribe = next(op).subscribe({
            next(value) {
              console.log('we received value', value);
              observer.next(value);
            },
            error(err) {
              console.log('we received error', err);
              observer.error(err);
            },
            complete() {
              observer.complete();
            },
          });
          return unsubscribe;
        });
      };
    };
    const opts = routerToServerAndClientNew(router, {
      server: {
        streaming: {
          enabled: true,
        },
      },
      client(opts) {
        return {
          links: [
            httpLink({
              url: opts.httpUrl,
            }),
          ],
        };
      },
    });
    return opts;
  })
  .afterEach(async (opts) => {
    await opts?.close?.();
  });

test('out-of-order streaming', async () => {
  const { client } = await ctx.build();

  expect(res).toBe('waited 100ms');
});
