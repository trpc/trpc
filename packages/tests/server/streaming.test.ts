import { EventEmitter, on } from 'node:events';
import { inspect } from 'node:util';
import {
  routerToServerAndClientNew,
  suppressLogs,
  waitError,
  waitTRPCClientError,
} from './___testHelpers';
import { waitFor } from '@testing-library/react';
import type { TRPCLink } from '@trpc/client';
import {
  httpBatchLink,
  splitLink,
  unstable_httpBatchStreamLink,
  unstable_httpSubscriptionLink,
} from '@trpc/client';
import { initTRPC, TRPCError } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import type { SSEvent } from '@trpc/server/unstable-core-do-not-import';
import { konn } from 'konn';
import superjson from 'superjson';
import { z } from 'zod';

const sleep = (ms = 1) => new Promise((resolve) => setTimeout(resolve, ms));

describe('no transformer', () => {
  const orderedResults: number[] = [];

  const ctx = konn()
    .beforeEach(() => {
      const t = initTRPC.create({
        experimental: {
          iterablesAndDeferreds: true,
        },
      });
      orderedResults.length = 0;

      const manualRelease = new Map<number, () => void>();

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
        error: t.procedure.query(() => {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        }),

        manualRelease: t.procedure
          .input(
            z.object({
              id: z.number(),
            }),
          )
          .query(async (opts) => {
            await new Promise<void>((resolve) => {
              manualRelease.set(opts.input.id, resolve);
            });
            return opts.input.id;
          }),

        iterable: t.procedure.query(async function* () {
          yield 1;
          yield 2;
          yield 3;
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
                orderedResults.push(value.result.data as number);
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
              unstable_httpBatchStreamLink({
                url: opts.httpUrl,
              }),
            ],
          };
        },
      });
      return {
        ...opts,
        manualRelease,
      };
    })
    .afterEach(async (opts) => {
      await opts?.close?.();
    })
    .done();

  test('out-of-order streaming', async () => {
    const { client } = ctx;

    const results = await Promise.all([
      client.deferred.query({ wait: 3 }),
      client.deferred.query({ wait: 1 }),
      client.deferred.query({ wait: 2 }),
    ]);

    // batch preserves request order
    expect(results).toEqual([3, 1, 2]);
    // streaming preserves response order
    expect(orderedResults).toEqual([1, 2, 3]);
  });

  test('out-of-order streaming with manual release', async () => {
    const { client } = ctx;
    const resolved: Record<number, boolean> = {
      0: false,
      1: false,
      2: false,
    };

    const promises = [
      client.manualRelease.query({ id: 0 }).then((v) => {
        resolved[0] = true;
        return v;
      }),
      client.manualRelease.query({ id: 1 }).then((v) => {
        resolved[1] = true;
        return v;
      }),
      client.manualRelease.query({ id: 2 }).then((v) => {
        resolved[2] = true;
        return v;
      }),
    ] as const;

    await waitFor(() => {
      expect(ctx.manualRelease.size).toBe(3);
    });

    // release 1
    ctx.manualRelease.get(1)!();
    await waitFor(() => {
      expect(resolved[1]).toBe(true);
      expect(resolved[0]).toBe(false);
      expect(resolved[2]).toBe(false);
    });

    // release 0 + 2
    ctx.manualRelease.get(0)!();
    ctx.manualRelease.get(2)!();

    expect(ctx.createContextSpy).toHaveBeenCalledTimes(1);

    await Promise.all(promises);
  });

  test('out-of-order streaming with error', async () => {
    const { client } = ctx;

    const results = await Promise.allSettled([
      client.deferred.query({ wait: 1 }),
      client.error.query(),
    ]);

    expect(results).toMatchInlineSnapshot(`
      Array [
        Object {
          "status": "fulfilled",
          "value": 1,
        },
        Object {
          "reason": [TRPCClientError: INTERNAL_SERVER_ERROR],
          "status": "rejected",
        },
      ]
    `);
  });

  test('iterable', async () => {
    const { client } = ctx;

    const iterable = await client.iterable.query();

    const aggregated: unknown[] = [];
    for await (const value of iterable) {
      aggregated.push(value);
    }
    expect(aggregated).toMatchInlineSnapshot(`
      Array [
        1,
        2,
        3,
      ]
    `);
  });
});

describe('with transformer', () => {
  const orderedResults: number[] = [];
  const ctx = konn()
    .beforeEach(() => {
      const onIterableInfiniteSpy = vi.fn<
        [
          {
            input: {
              lastEventId?: number;
            };
          },
        ]
      >();
      const ee = new EventEmitter();
      const eeEmit = (data: number) => {
        ee.emit('data', data);
      };

      const t = initTRPC.create({
        transformer: superjson,
        experimental: {
          iterablesAndDeferreds: true,
        },
      });
      orderedResults.length = 0;
      const infiniteYields = vi.fn();

      const router = t.router({
        wait: t.procedure
          .input(
            z.object({
              wait: z.number(),
            }),
          )
          .query(async (opts) => {
            await new Promise<typeof opts.input.wait>((resolve) =>
              setTimeout(resolve, opts.input.wait * 10),
            );
            return opts.input.wait;
          }),
        deferred: t.procedure.query(() => {
          return {
            foo: Promise.resolve('bar'),
          };
        }),
        error: t.procedure.query(() => {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        }),
        iterable: t.procedure.query(async function* () {
          yield 1;
          yield 2;
          yield 3;
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
                orderedResults.push(value.result.data as number);
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
              splitLink({
                condition: (op) => !!op.context['httpBatchLink'],
                true: httpBatchLink({
                  url: opts.httpUrl,
                  transformer: superjson,
                }),
                false: splitLink({
                  condition: (op) => op.type === 'subscription',
                  true: unstable_httpSubscriptionLink({
                    url: opts.httpUrl,
                    transformer: superjson,
                  }),
                  false: unstable_httpBatchStreamLink({
                    url: opts.httpUrl,
                    transformer: superjson,
                  }),
                }),
              }),
            ],
          };
        },
      });
      return {
        ...opts,
        ee,
        eeEmit,
        infiniteYields,
        onIterableInfiniteSpy,
      };
    })
    .afterEach(async (opts) => {
      await opts?.close?.();
    })
    .done();

  test('out-of-order streaming', async () => {
    const { client } = ctx;

    const results = await Promise.all([
      client.wait.query({ wait: 3 }),
      client.wait.query({ wait: 1 }),
      client.wait.query({ wait: 2 }),
    ]);

    // batch preserves request order
    expect(results).toEqual([3, 1, 2]);
    // streaming preserves response order
    expect(orderedResults).toEqual([1, 2, 3]);
  });
  test('out-of-order streaming with error', async () => {
    const { client } = ctx;

    const results = await Promise.allSettled([
      client.wait.query({ wait: 1 }),
      client.error.query(),
    ]);

    expect(results).toMatchInlineSnapshot(`
      Array [
        Object {
          "status": "fulfilled",
          "value": 1,
        },
        Object {
          "reason": [TRPCClientError: INTERNAL_SERVER_ERROR],
          "status": "rejected",
        },
      ]
    `);
  });

  test('iterable', async () => {
    const { client } = ctx;

    const iterable = await client.iterable.query();

    const aggregated: unknown[] = [];
    for await (const value of iterable) {
      aggregated.push(value);
    }
    expect(aggregated).toMatchInlineSnapshot(`
      Array [
        1,
        2,
        3,
      ]
    `);
  });

  test('call deferred procedures with httpBatchLink', async () => {
    const { client } = ctx;

    type AppRouter = (typeof ctx)['router'];
    {
      const err = await waitTRPCClientError<AppRouter>(
        client.iterable.query(undefined, {
          context: {
            httpBatchLink: true,
          },
        }),
      );
      delete err.data?.stack;
      expect(err).toMatchInlineSnapshot(
        `[TRPCClientError: Cannot use async generator in non-streaming response]`,
      );
      expect(err.data).toMatchInlineSnapshot(`
      Object {
        "code": "UNSUPPORTED_MEDIA_TYPE",
        "httpStatus": 415,
        "path": "iterable",
      }
    `);
    }
    {
      const err = await waitTRPCClientError<AppRouter>(
        client.deferred.query(undefined, {
          context: {
            httpBatchLink: true,
          },
        }),
      );
      delete err.data?.stack;

      expect(err).toMatchInlineSnapshot(
        `[TRPCClientError: Cannot use object with promises in non-streaming response]`,
      );
      expect(err.data).toMatchInlineSnapshot(`
        Object {
          "code": "UNSUPPORTED_MEDIA_TYPE",
          "httpStatus": 415,
          "path": "deferred",
        }
      `);
    }
  });
});
