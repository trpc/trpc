import { routerToServerAndClientNew } from './___testHelpers';
import { TRPCLink, httpBatchLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { konn } from 'konn';
import superjson from 'superjson';
import { z } from 'zod';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const unidici = require('undici');

globalThis.fetch = unidici.fetch;

describe('no transformer', () => {
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
            return opts.input.wait;
          }),
      });

      const results: {
        type: 'next' | 'error';
        value: unknown;
        opId: number;
      }[] = [];

      const linkSpy: TRPCLink<typeof router> = () => {
        // here we just got initialized in the app - this happens once per app
        // useful for storing cache for instance
        return ({ next, op }) => {
          // this is when passing the result to the next link
          // each link needs to return an observable which propagates results
          return observable((observer) => {
            const unsubscribe = next(op).subscribe({
              next(value) {
                console.log('got value', value.result);
                results.push({
                  type: 'next',
                  value,
                  opId: op.id,
                });
                observer.next((value as any).result);
              },
              error(err) {
                results.push({
                  type: 'error',
                  value: err,
                  opId: op.id,
                });
                observer.error(err);
              },
            });
            return unsubscribe;
          });
        };
      };
      const opts = routerToServerAndClientNew(router, {
        server: {
          streaming: {
            enabled: false,
          },
        },
        client(opts) {
          return {
            links: [
              linkSpy,
              httpBatchLink({
                url: opts.httpUrl,
              }),
            ],
          };
        },
      });
      return {
        ...opts,
        results,
      };
    })
    .afterEach(async (opts) => {
      await opts?.close?.();
    })
    .done();

  test.only('out-of-order streaming', async () => {
    const { proxy } = ctx;

    const results = await Promise.all([
      await proxy.deferred.query({ wait: 3 }),
      await proxy.deferred.query({ wait: 1 }),
      await proxy.deferred.query({ wait: 2 }),
    ]);

    expect(results).toBe([3, 1, 2]);

    expect(ctx.results).toMatchInlineSnapshot();
  });
});

describe('with transformer', () => {
  const ctx = konn()
    .beforeEach(() => {
      const t = initTRPC.create({
        transformer: superjson,
      });

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
            return opts.input.wait;
          }),
      });

      const results: {
        type: 'next' | 'error';
        value: unknown;
        opId: number;
      }[] = [];

      const linkSpy: TRPCLink<typeof router> = () => {
        // here we just got initialized in the app - this happens once per app
        // useful for storing cache for instance
        return ({ next, op }) => {
          // this is when passing the result to the next link
          // each link needs to return an observable which propagates results
          return observable((observer) => {
            const unsubscribe = next(op).subscribe({
              next(value) {
                console.log('got value', value.result);
                results.push({
                  type: 'next',
                  value,
                  opId: op.id,
                });
                observer.next((value as any).result);
              },
              error(err) {
                results.push({
                  type: 'error',
                  value: err,
                  opId: op.id,
                });
                observer.error(err);
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
            transformer: superjson,
            links: [
              linkSpy,
              httpBatchLink({
                url: opts.httpUrl,
              }),
            ],
          };
        },
      });
      return {
        ...opts,
        results,
      };
    })
    .afterEach(async (opts) => {
      await opts?.close?.();
    })
    .done();

  test('out-of-order streaming', async () => {
    const { proxy } = ctx;

    const results = await Promise.all([
      await proxy.deferred.query({ wait: 3 }),
      await proxy.deferred.query({ wait: 1 }),
      await proxy.deferred.query({ wait: 2 }),
    ]);

    expect(results).toBe([3, 1, 2]);

    expect(ctx.results).toMatchInlineSnapshot();
  });
});
