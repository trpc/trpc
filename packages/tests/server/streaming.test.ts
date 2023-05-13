import { routerToServerAndClientNew } from './___testHelpers';
import { TRPCLink, httpBatchLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { konn } from 'konn';
import superjson from 'superjson';
import { z } from 'zod';

describe('no transformer', () => {
  const orderedResults: number[] = [];
  const ctx = konn()
    .beforeEach(() => {
      const t = initTRPC.create({});
      orderedResults.length = 0;
      const router = t.router({
        deferred: t.procedure
          .input(
            z.object({
              wait: z.number(),
            }),
          )
          .query(async (opts) => {
            await new Promise<void>((resolve) =>
              setTimeout(resolve, opts.input.wait * 10),
            );
            return opts.input.wait;
          }),
      });

      const linkSpy: TRPCLink<typeof router> = () => {
        // here we just got initialized in the app - this happens once per app
        // useful for storing cache for instance
        return ({ next, op }) => {
          // this is when passing the result to the next link
          // each link needs to return an observable which propagates results
          return observable((observer) => {
            const unsubscribe = next(op).subscribe({
              next(value) {
                orderedResults.push((value.result as any).data);
                observer.next(value);
              },
              error: observer.error,
            });
            return unsubscribe;
          });
        };
      };
      const opts = routerToServerAndClientNew(router, {
        server: {},
        client(opts) {
          return {
            links: [
              linkSpy,
              httpBatchLink({
                url: opts.httpUrl,
                mode: 'stream',
              }),
            ],
          };
        },
      });
      return opts;
    })
    .afterEach(async (opts) => {
      await opts?.close?.();
    })
    .done();

  test('out-of-order streaming', async () => {
    const { proxy } = ctx;

    const results = await Promise.all([
      proxy.deferred.query({ wait: 3 }),
      proxy.deferred.query({ wait: 1 }),
      proxy.deferred.query({ wait: 2 }),
    ]);

    // batch preserves request order
    expect(results).toEqual([3, 1, 2]);
    // streaming preserves response order
    expect(orderedResults).toEqual([1, 2, 3]);
  });
});

describe('with transformer', () => {
  const orderedResults: number[] = [];
  const ctx = konn()
    .beforeEach(() => {
      const t = initTRPC.create({
        transformer: superjson,
      });
      orderedResults.length = 0;

      const router = t.router({
        deferred: t.procedure
          .input(
            z.object({
              wait: z.number(),
            }),
          )
          .query(async (opts) => {
            await new Promise<void>((resolve) =>
              setTimeout(resolve, opts.input.wait * 10),
            );
            return opts.input.wait;
          }),
      });

      const linkSpy: TRPCLink<typeof router> = () => {
        // here we just got initialized in the app - this happens once per app
        // useful for storing cache for instance
        return ({ next, op }) => {
          // this is when passing the result to the next link
          // each link needs to return an observable which propagates results
          return observable((observer) => {
            const unsubscribe = next(op).subscribe({
              next(value) {
                orderedResults.push((value.result as any).data);
                observer.next(value);
              },
              error: observer.error,
            });
            return unsubscribe;
          });
        };
      };
      const opts = routerToServerAndClientNew(router, {
        server: {},
        client(opts) {
          return {
            transformer: superjson,
            links: [
              linkSpy,
              httpBatchLink({
                mode: 'stream',
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
    })
    .done();

  test('out-of-order streaming', async () => {
    const { proxy } = ctx;

    const results = await Promise.all([
      proxy.deferred.query({ wait: 3 }),
      proxy.deferred.query({ wait: 1 }),
      proxy.deferred.query({ wait: 2 }),
    ]);

    // batch preserves request order
    expect(results).toEqual([3, 1, 2]);
    // streaming preserves response order
    expect(orderedResults).toEqual([1, 2, 3]);
  });
});
