import { EventEmitter } from 'node:events';
import { routerToServerAndClientNew } from './___testHelpers';
import { waitError } from '@trpc/server/__tests__/waitError';
import { waitFor } from '@testing-library/react';
import type { TRPCLink } from '@trpc/client';
import {
  httpBatchLink,
  splitLink,
  TRPCClientError,
  unstable_httpBatchStreamLink,
  unstable_httpSubscriptionLink,
} from '@trpc/client';
import { initTRPC, TRPCError } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import type { InferrableClientTypes } from '@trpc/server/unstable-core-do-not-import';
import { createDeferred, run } from '@trpc/server/unstable-core-do-not-import';
import { konn } from 'konn';
import superjson from 'superjson';
import { z } from 'zod';
import { zAsyncIterable } from './zAsyncIterable';

async function waitTRPCClientError<TRoot extends InferrableClientTypes>(
  fnOrPromise: Promise<unknown> | (() => unknown),
) {
  return waitError<TRPCClientError<TRoot>>(fnOrPromise, TRPCClientError);
}

describe('no transformer', () => {
  const orderedResults: number[] = [];

  const ctx = konn()
    .beforeEach(() => {
      const t = initTRPC.create({});
      orderedResults.length = 0;

      const manualRelease = new Map<number, () => void>();

      let iterableDeferred = createDeferred();
      const nextIterable = () => {
        iterableDeferred.resolve();
      };
      const yieldSpy = vi.fn((v: number) => v);

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
        embedPromise: t.procedure.query(() => {
          return {
            deeply: run(async () => {
              return {
                nested: run(async () => {
                  return {
                    promise: Promise.resolve('foo'),
                  };
                }),
              };
            }),
          };
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

        iterable: t.procedure
          .input(
            z
              .object({
                badYield: z.boolean(),
                badReturn: z.boolean(),
              })
              .partial()
              .optional(),
          )
          .output(
            zAsyncIterable({
              yield: z.number(),
              return: z.string(),
            }),
          )
          .query(async function* (opts) {
            for (let i = 0; i < 10; i++) {
              yield yieldSpy(i + 1);

              await iterableDeferred.promise;

              iterableDeferred = createDeferred();
            }

            if (opts.input?.badYield) {
              yield 'ONLY_YIELDS_NUMBERS' as never;
            }
            if (opts.input?.badReturn) {
              return 123 as never;
            }
            return 'done';
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
        server: {
          createContext: (opts) => {
            return opts;
          },
        },
        wsClient: {
          lazy: {
            enabled: true,
            closeMs: 1,
          },
        },
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
        yieldSpy,
        manualRelease,
        nextIterable,
        iterablePromise: iterableDeferred.promise,
      };
    })
    .afterEach(async (opts) => {
      await opts?.close?.();
    })
    .done();

  test('server-side call', async () => {
    const caller = ctx.router.createCaller({});
    const iterable = await caller.iterable();
    expectTypeOf(iterable).toEqualTypeOf<
      AsyncIterable<number, string, unknown>
    >();

    const aggregated: number[] = [];
    for await (const value of iterable) {
      ctx.nextIterable();
      aggregated.push(value);
    }
    expect(aggregated).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

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

    expectTypeOf(iterable).toEqualTypeOf<
      AsyncIterable<number, string, unknown>
    >();
    const aggregated: unknown[] = [];
    for await (const value of iterable) {
      aggregated.push(value);
      ctx.nextIterable();
    }
    expect(aggregated).toMatchInlineSnapshot(`
      Array [
        1,
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
      ]
    `);
  });

  test('iterable return', async () => {
    const { client } = ctx;

    const iterable = await client.iterable.query();
    const iterator = iterable[Symbol.asyncIterator]();

    const aggregated: unknown[] = [];

    let r;
    while (!(r = await iterator.next()).done) {
      aggregated.push(r.value);
      ctx.nextIterable();
    }
    expect(r.value).toBe('done');
  });

  test('iterable cancellation', async () => {
    const { client } = ctx;
    const ac = new AbortController();

    const iterable = await client.iterable.query(undefined, {
      signal: ac.signal,
    });
    const aggregated: unknown[] = [];
    ctx.nextIterable();
    const err = await waitError(async () => {
      for await (const value of iterable) {
        aggregated.push(value);
        if (value === 2) {
          ac.abort();
        }
        ctx.nextIterable();
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    });
    for (let i = 0; i < 10; i++) {
      // release some more values, all shouldn't be yielded
      await ctx.iterablePromise;
      ctx.nextIterable();
    }

    await waitFor(() => {
      expect(ctx.connections.size).toBe(0);
    });
    expect(ctx.yieldSpy.mock.calls.flatMap((it) => it[0]))
      .toMatchInlineSnapshot(`
        Array [
          1,
          2,
          3,
          4,
          5,
        ]
      `);
    expect(err).toMatchInlineSnapshot(
      `[AbortError: The operation was aborted.]`,
    );
    expect(err.message).toMatchInlineSnapshot(`"The operation was aborted."`);
  });

  test('output validation iterable yield error', async () => {
    const clientError = await waitError(
      async () => {
        const iterable = await ctx.client.iterable.query({
          badYield: true,
        });
        for await (const value of iterable) {
          ctx.nextIterable();
        }
      },
      TRPCClientError<typeof ctx.router>,
    );

    expect(clientError.data?.code).toBe('INTERNAL_SERVER_ERROR');
    expect(clientError.message).toMatchInlineSnapshot(`
      "[
        {
          "code": "invalid_type",
          "expected": "number",
          "received": "string",
          "path": [],
          "message": "Expected number, received string"
        }
      ]"
    `);
    expect(ctx.onErrorSpy).toHaveBeenCalledOnce();

    const serverError = ctx.onErrorSpy.mock.calls[0]![0].error;
    expect(serverError.code).toBe('INTERNAL_SERVER_ERROR');
    expect(serverError.message).toMatchInlineSnapshot(`""`);
  });

  test('output validation iterable return error', async () => {
    const clientError = await waitError(
      async () => {
        const iterable = await ctx.client.iterable.query({
          badReturn: true,
        });
        for await (const value of iterable) {
          ctx.nextIterable();
        }
      },
      TRPCClientError<typeof ctx.router>,
    );

    expect(clientError.data?.code).toBe('INTERNAL_SERVER_ERROR');
    expect(clientError.message).toMatchInlineSnapshot(`
      "[
        {
          "code": "invalid_type",
          "expected": "string",
          "received": "number",
          "path": [],
          "message": "Expected string, received number"
        }
      ]"
    `);
    expect(ctx.onErrorSpy).toHaveBeenCalledOnce();

    const serverError = ctx.onErrorSpy.mock.calls[0]![0].error;
    expect(serverError.code).toBe('INTERNAL_SERVER_ERROR');
    expect(serverError.message).toMatchInlineSnapshot(`""`);
  });

  test('embed promise', async () => {
    const { client } = ctx;

    const result = await client.embedPromise.query();

    expectTypeOf(result).toEqualTypeOf<{
      deeply: Promise<{
        nested: Promise<{
          promise: Promise<string>;
        }>;
      }>;
    }>();

    expect(result.deeply).toBeInstanceOf(Promise);
    const deeply = await result.deeply;
    expect(deeply.nested).toBeInstanceOf(Promise);
    const nested = await deeply.nested;
    expect(nested.promise).toBeInstanceOf(Promise);
    const promise = await nested.promise;

    expect(promise).toEqual('foo');
  });
});

describe('with transformer', () => {
  const orderedResults: number[] = [];
  const ctx = konn()
    .beforeEach(() => {
      const onIterableInfiniteSpy = vi.fn<
        (args: {
          input: {
            lastEventId?: number;
          };
        }) => void
      >();
      const ee = new EventEmitter();
      const eeEmit = (data: number) => {
        ee.emit('data', data);
      };

      const t = initTRPC.create({
        transformer: superjson,
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
          yield 1 as number;
          yield 2;
          yield 3;

          return 'done';
        }),
        iterableWithError: t.procedure.query(async function* () {
          yield 1;
          yield 2;
          throw new Error('foo');
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

    expectTypeOf(iterable).toEqualTypeOf<
      AsyncIterable<number, string, unknown>
    >();

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

  test('iterable return', async () => {
    const { client } = ctx;

    const iterable = await client.iterable.query();
    const iterator = iterable[Symbol.asyncIterator]();

    const aggregated: unknown[] = [];

    let r;
    while (!(r = await iterator.next()).done) {
      aggregated.push(r.value);
    }
    expect(aggregated).toMatchInlineSnapshot(`
      Array [
        1,
        2,
        3,
      ]
    `);
    expect(r.value).toBe('done');
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
        `[TRPCClientError: Cannot use stream-like response in non-streaming request - use httpBatchStreamLink]`,
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
        `[TRPCClientError: Cannot use stream-like response in non-streaming request - use httpBatchStreamLink]`,
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

  test('iterable with error', async () => {
    const { client, router } = ctx;

    const iterable = await client.iterableWithError.query();

    const aggregated: unknown[] = [];
    const error = await waitError(
      async () => {
        for await (const value of iterable) {
          aggregated.push(value);
        }
      },
      TRPCClientError<typeof router>,
    );

    error.data!.stack = '[redacted]';
    expect(error.data).toMatchInlineSnapshot(`
      Object {
        "code": "INTERNAL_SERVER_ERROR",
        "httpStatus": 500,
        "path": "iterableWithError",
        "stack": "[redacted]",
      }
    `);
    expect(aggregated).toEqual([1, 2]);
    expect(error.message).toBe('foo');
  });
});
