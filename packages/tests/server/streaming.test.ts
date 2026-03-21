import { EventEmitter } from 'node:events';
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { waitError } from '@trpc/server/__tests__/waitError';
import '@testing-library/react';
import type { TRPCLink } from '@trpc/client';
import {
  httpBatchLink,
  httpBatchStreamLink,
  httpSubscriptionLink,
  splitLink,
  TRPCClientError,
} from '@trpc/client';
import { createTRPCDeclaredError, initTRPC, TRPCError } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import type { InferrableClientTypes } from '@trpc/server/unstable-core-do-not-import';
import { createDeferred, run } from '@trpc/server/unstable-core-do-not-import';
import superjson from 'superjson';
import { z } from 'zod';
import { zAsyncIterable } from './zAsyncIterable';

async function waitTRPCClientError<TRoot extends InferrableClientTypes>(
  fnOrPromise: Promise<unknown> | (() => unknown),
) {
  return waitError<TRPCClientError<TRoot>>(fnOrPromise, TRPCClientError);
}

function createLinkSpy<TRouter extends InferrableClientTypes>() {
  const orderedResults: number[] = [];
  const link: TRPCLink<TRouter> = () => {
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
  return { orderedResults, link };
}

describe('no transformer', () => {
  test('server-side call', async () => {
    const t = initTRPC.create({});
    let iterableDeferred = createDeferred();
    const nextIterable = () => {
      iterableDeferred.resolve();
    };
    const yieldSpy = vi.fn((v: number) => v);

    const router = t.router({
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

    const caller = router.createCaller({});
    const iterable = await caller.iterable();
    expectTypeOf(iterable).toEqualTypeOf<
      AsyncIterable<number, string, unknown>
    >();

    const aggregated: number[] = [];
    for await (const value of iterable) {
      nextIterable();
      aggregated.push(value);
    }
    expect(aggregated).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  test('out-of-order streaming', async () => {
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
            setTimeout(resolve, opts.input.wait * 10),
          );
          return opts.input.wait;
        }),
    });

    const linkSpy = createLinkSpy<typeof router>();

    await using ctx = testServerAndClientResource(router, {
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
            linkSpy.link,
            httpBatchStreamLink({
              url: opts.httpUrl,
            }),
          ],
        };
      },
    });

    const results = await Promise.all([
      ctx.client.deferred.query({ wait: 3 }),
      ctx.client.deferred.query({ wait: 1 }),
      ctx.client.deferred.query({ wait: 2 }),
    ]);

    // batch preserves request order
    expect(results).toEqual([3, 1, 2]);
    // streaming preserves response order
    expect(linkSpy.orderedResults).toEqual([1, 2, 3]);
  });

  test('out-of-order streaming with manual release', async () => {
    const t = initTRPC.create({});
    const manualRelease = new Map<number, () => void>();

    const router = t.router({
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
    });

    const linkSpy: TRPCLink<typeof router> = () => {
      return ({ next, op }) => {
        return observable((observer) => {
          const unsubscribe = next(op).subscribe({
            next(value) {
              observer.next(value);
            },
            error: observer.error,
          });
          return unsubscribe;
        });
      };
    };

    await using ctx = testServerAndClientResource(router, {
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
            httpBatchStreamLink({
              url: opts.httpUrl,
            }),
          ],
        };
      },
    });

    const resolved: Record<number, boolean> = {
      0: false,
      1: false,
      2: false,
    };

    const promises = [
      ctx.client.manualRelease.query({ id: 0 }).then((v) => {
        resolved[0] = true;
        return v;
      }),
      ctx.client.manualRelease.query({ id: 1 }).then((v) => {
        resolved[1] = true;
        return v;
      }),
      ctx.client.manualRelease.query({ id: 2 }).then((v) => {
        resolved[2] = true;
        return v;
      }),
    ] as const;

    await vi.waitFor(() => {
      expect(manualRelease.size).toBe(3);
    });

    // release 1
    manualRelease.get(1)!();
    await vi.waitFor(() => {
      expect(resolved[1]).toBe(true);
      expect(resolved[0]).toBe(false);
      expect(resolved[2]).toBe(false);
    });

    // release 0 + 2
    manualRelease.get(0)!();
    manualRelease.get(2)!();

    expect(ctx.createContextSpy).toHaveBeenCalledTimes(1);

    await Promise.all(promises);
  });

  test('out-of-order streaming with error', async () => {
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
            setTimeout(resolve, opts.input.wait * 10),
          );
          return opts.input.wait;
        }),
      error: t.procedure.query(() => {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      }),
    });

    const linkSpy = createLinkSpy<typeof router>();

    await using ctx = testServerAndClientResource(router, {
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
            linkSpy.link,
            httpBatchStreamLink({
              url: opts.httpUrl,
            }),
          ],
        };
      },
    });

    const results = await Promise.allSettled([
      ctx.client.deferred.query({ wait: 1 }),
      ctx.client.error.query(),
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
    const t = initTRPC.create({});
    let iterableDeferred = createDeferred();
    const nextIterable = () => {
      iterableDeferred.resolve();
    };
    const yieldSpy = vi.fn((v: number) => v);

    const router = t.router({
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

    const linkSpy = createLinkSpy<typeof router>();

    await using ctx = testServerAndClientResource(router, {
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
            linkSpy.link,
            httpBatchStreamLink({
              url: opts.httpUrl,
            }),
          ],
        };
      },
    });

    const iterable = await ctx.client.iterable.query();

    expectTypeOf(iterable).toEqualTypeOf<
      AsyncIterable<number, string, unknown>
    >();
    const aggregated: unknown[] = [];
    for await (const value of iterable) {
      aggregated.push(value);
      nextIterable();
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
    const t = initTRPC.create({});
    let iterableDeferred = createDeferred();
    const nextIterable = () => {
      iterableDeferred.resolve();
    };
    const yieldSpy = vi.fn((v: number) => v);

    const router = t.router({
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

    const linkSpy = createLinkSpy<typeof router>();

    await using ctx = testServerAndClientResource(router, {
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
            linkSpy.link,
            httpBatchStreamLink({
              url: opts.httpUrl,
            }),
          ],
        };
      },
    });

    const iterable = await ctx.client.iterable.query();
    const iterator = iterable[Symbol.asyncIterator]();

    const aggregated: unknown[] = [];

    let r;
    while (!(r = await iterator.next()).done) {
      aggregated.push(r.value);
      nextIterable();
    }
    expect(r.value).toBe('done');
  });

  test('iterable cancellation', async () => {
    const t = initTRPC.create({});
    let iterableDeferred = createDeferred();
    const nextIterable = () => {
      iterableDeferred.resolve();
    };
    const yieldSpy = vi.fn((v: number) => v);
    const iterablePromise = iterableDeferred.promise;

    const router = t.router({
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

    const linkSpy = createLinkSpy<typeof router>();

    await using ctx = testServerAndClientResource(router, {
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
            linkSpy.link,
            httpBatchStreamLink({
              url: opts.httpUrl,
            }),
          ],
        };
      },
    });

    const ac = new AbortController();

    const iterable = await ctx.client.iterable.query(undefined, {
      signal: ac.signal,
    });
    const aggregated: unknown[] = [];
    nextIterable();
    const err = await waitError(async () => {
      for await (const value of iterable) {
        aggregated.push(value);
        if (value === 2) {
          ac.abort();
        }
        nextIterable();
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    });
    for (let i = 0; i < 10; i++) {
      // release some more values, all shouldn't be yielded
      await iterablePromise;
      nextIterable();
    }

    await vi.waitFor(() => {
      expect(ctx.wsClient.connection).toBeNull();
    });
    expect(yieldSpy.mock.calls.flatMap((it) => it[0])).toMatchInlineSnapshot(`
        Array [
          1,
          2,
          3,
          4,
          5,
        ]
      `);
    expect(err).toMatchInlineSnapshot(
      `[AbortError: This operation was aborted]`,
    );
    expect(err.message).toMatchInlineSnapshot(`"This operation was aborted"`);
  });

  test('output validation iterable yield error', async () => {
    const t = initTRPC.create({});
    let iterableDeferred = createDeferred();
    const nextIterable = () => {
      iterableDeferred.resolve();
    };
    const yieldSpy = vi.fn((v: number) => v);

    const router = t.router({
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

    const linkSpy = createLinkSpy<typeof router>();

    await using ctx = testServerAndClientResource(router, {
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
            linkSpy.link,
            httpBatchStreamLink({
              url: opts.httpUrl,
            }),
          ],
        };
      },
    });

    const clientError = await waitError(
      async () => {
        const iterable = await ctx.client.iterable.query({
          badYield: true,
        });
        for await (const value of iterable) {
          nextIterable();
        }
      },
      TRPCClientError<typeof router>,
    );

    expect(clientError.data?.code).toBe('INTERNAL_SERVER_ERROR');
    expect(clientError.message).toMatchInlineSnapshot(`
      "[
        {
          "expected": "number",
          "code": "invalid_type",
          "path": [],
          "message": "Invalid input: expected number, received string"
        }
      ]"
    `);
    expect(ctx.onErrorSpy).toHaveBeenCalledOnce();

    const serverError = ctx.onErrorSpy.mock.calls[0]![0].error;
    expect(serverError.code).toBe('INTERNAL_SERVER_ERROR');
    expect(serverError.message).toBe(clientError.message);
  });

  test('output validation iterable return error', async () => {
    const t = initTRPC.create({});
    let iterableDeferred = createDeferred();
    const nextIterable = () => {
      iterableDeferred.resolve();
    };
    const yieldSpy = vi.fn((v: number) => v);

    const router = t.router({
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

    const linkSpy = createLinkSpy<typeof router>();

    await using ctx = testServerAndClientResource(router, {
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
            linkSpy.link,
            httpBatchStreamLink({
              url: opts.httpUrl,
            }),
          ],
        };
      },
    });

    const clientError = await waitError(
      async () => {
        const iterable = await ctx.client.iterable.query({
          badReturn: true,
        });
        for await (const value of iterable) {
          nextIterable();
        }
      },
      TRPCClientError<typeof router>,
    );

    expect(clientError.data?.code).toBe('INTERNAL_SERVER_ERROR');
    expect(clientError.message).toMatchInlineSnapshot(`
      "[
        {
          "expected": "string",
          "code": "invalid_type",
          "path": [],
          "message": "Invalid input: expected string, received number"
        }
      ]"
    `);
    expect(ctx.onErrorSpy).toHaveBeenCalledOnce();

    const serverError = ctx.onErrorSpy.mock.calls[0]![0].error;
    expect(serverError.code).toBe('INTERNAL_SERVER_ERROR');
    expect(serverError.message).toBe(clientError.message);
  });

  test('embed promise', async () => {
    const t = initTRPC.create({});

    const router = t.router({
      embedPromise: t.procedure.query(() => {
        return {
          deeply: Promise.resolve({
            nested: Promise.resolve({
              promise: Promise.resolve('foo'),
            }),
          }),
        };
      }),
    });

    const linkSpy = createLinkSpy<typeof router>();

    await using ctx = testServerAndClientResource(router, {
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
            linkSpy.link,
            httpBatchStreamLink({
              url: opts.httpUrl,
            }),
          ],
        };
      },
    });

    const result = await ctx.client.embedPromise.query();

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

describe('declared errors over httpBatchStreamLink', () => {
  const BadPhoneError = createTRPCDeclaredError('UNAUTHORIZED')
    .data<{
      reason: 'BAD_PHONE';
    }>()
    .create({
      constants: {
        reason: 'BAD_PHONE' as const,
      },
    });

  const t = initTRPC.create({
    errorFormatter({ shape }) {
      return {
        ...shape,
        data: {
          ...shape.data,
          foo: 'bar' as const,
        },
      };
    },
  });

  const router = t.router({
    registered: t.procedure.errors([BadPhoneError]).query(() => {
      throw new BadPhoneError();
    }),
    unregistered: t.procedure.query(() => {
      throw new BadPhoneError();
    }),
  });

  test('propagates registered declared errors', async () => {
    await using ctx = testServerAndClientResource(router, {
      clientLink: 'httpBatchStreamLink',
    });

    const registeredError = await waitTRPCClientError<typeof router>(
      ctx.client.registered.query(),
    );

    expect(registeredError.shape).toEqual({
      code: -32001,
      message: 'UNAUTHORIZED',
      data: {
        reason: 'BAD_PHONE',
      },
    });
    expect(registeredError.data).toEqual({
      reason: 'BAD_PHONE',
    });
  });

  test('downgrades unregistered declared errors', async () => {
    await using ctx = testServerAndClientResource(router, {
      clientLink: 'httpBatchStreamLink',
    });

    const unregisteredError = await waitTRPCClientError<typeof router>(
      ctx.client.unregistered.query(),
    );

    expect(unregisteredError.shape).toMatchObject({
      code: -32603,
      message: 'An unrecognized error occured',
      data: {
        code: 'INTERNAL_SERVER_ERROR',
        foo: 'bar',
        httpStatus: 500,
        path: 'unregistered',
      },
    });
    expect(unregisteredError.data).toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      foo: 'bar',
      httpStatus: 500,
      path: 'unregistered',
    });
    expect(unregisteredError.data).not.toHaveProperty('reason');
  });
});

describe('with transformer', () => {
  test('out-of-order streaming', async () => {
    const t = initTRPC.create({
      transformer: superjson,
    });

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
    });

    const linkSpy = createLinkSpy<typeof router>();

    await using ctx = testServerAndClientResource(router, {
      server: {},
      client(opts) {
        return {
          links: [
            linkSpy.link,
            splitLink({
              condition: (op) => !!op.context['httpBatchLink'],
              true: httpBatchLink({
                url: opts.httpUrl,
                transformer: superjson,
              }),
              false: splitLink({
                condition: (op) => op.type === 'subscription',
                true: httpSubscriptionLink({
                  url: opts.httpUrl,
                  transformer: superjson,
                }),
                false: httpBatchStreamLink({
                  url: opts.httpUrl,
                  transformer: superjson,
                }),
              }),
            }),
          ],
        };
      },
    });

    const results = await Promise.all([
      ctx.client.wait.query({ wait: 3 }),
      ctx.client.wait.query({ wait: 1 }),
      ctx.client.wait.query({ wait: 2 }),
    ]);

    // batch preserves request order
    expect(results).toEqual([3, 1, 2]);
    // streaming preserves response order
    expect(linkSpy.orderedResults).toEqual([1, 2, 3]);
  });
  test('out-of-order streaming with error', async () => {
    const t = initTRPC.create({
      transformer: superjson,
    });

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
      error: t.procedure.query(() => {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      }),
    });

    const linkSpy = createLinkSpy<typeof router>();

    await using ctx = testServerAndClientResource(router, {
      server: {},
      client(opts) {
        return {
          links: [
            linkSpy.link,
            splitLink({
              condition: (op) => !!op.context['httpBatchLink'],
              true: httpBatchLink({
                url: opts.httpUrl,
                transformer: superjson,
              }),
              false: splitLink({
                condition: (op) => op.type === 'subscription',
                true: httpSubscriptionLink({
                  url: opts.httpUrl,
                  transformer: superjson,
                }),
                false: httpBatchStreamLink({
                  url: opts.httpUrl,
                  transformer: superjson,
                }),
              }),
            }),
          ],
        };
      },
    });

    const results = await Promise.allSettled([
      ctx.client.wait.query({ wait: 1 }),
      ctx.client.error.query(),
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
    const t = initTRPC.create({
      transformer: superjson,
    });

    const router = t.router({
      iterable: t.procedure.query(async function* () {
        yield 1 as number;
        yield 2;
        yield 3;

        return 'done';
      }),
    });

    const linkSpy = createLinkSpy<typeof router>();

    await using ctx = testServerAndClientResource(router, {
      server: {},
      client(opts) {
        return {
          links: [
            linkSpy.link,
            splitLink({
              condition: (op) => !!op.context['httpBatchLink'],
              true: httpBatchLink({
                url: opts.httpUrl,
                transformer: superjson,
              }),
              false: splitLink({
                condition: (op) => op.type === 'subscription',
                true: httpSubscriptionLink({
                  url: opts.httpUrl,
                  transformer: superjson,
                }),
                false: httpBatchStreamLink({
                  url: opts.httpUrl,
                  transformer: superjson,
                }),
              }),
            }),
          ],
        };
      },
    });

    const iterable = await ctx.client.iterable.query();

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
    const t = initTRPC.create({
      transformer: superjson,
    });

    const router = t.router({
      iterable: t.procedure.query(async function* () {
        yield 1 as number;
        yield 2;
        yield 3;

        return 'done';
      }),
    });

    await using ctx = testServerAndClientResource(router, {
      server: {},
      client(opts) {
        return {
          links: [
            splitLink({
              condition: (op) => !!op.context['httpBatchLink'],
              true: httpBatchLink({
                url: opts.httpUrl,
                transformer: superjson,
              }),
              false: splitLink({
                condition: (op) => op.type === 'subscription',
                true: httpSubscriptionLink({
                  url: opts.httpUrl,
                  transformer: superjson,
                }),
                false: httpBatchStreamLink({
                  url: opts.httpUrl,
                  transformer: superjson,
                }),
              }),
            }),
          ],
        };
      },
    });

    const iterable = await ctx.client.iterable.query();
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
    const t = initTRPC.create({
      transformer: superjson,
    });

    const router = t.router({
      iterable: t.procedure.query(async function* () {
        yield 1 as number;
        yield 2;
        yield 3;

        return 'done';
      }),
      deferred: t.procedure.query(() => {
        return {
          foo: Promise.resolve('bar'),
        };
      }),
    });

    await using ctx = testServerAndClientResource(router, {
      server: {},
      client(opts) {
        return {
          links: [
            splitLink({
              condition: (op) => !!op.context['httpBatchLink'],
              true: httpBatchLink({
                url: opts.httpUrl,
                transformer: superjson,
              }),
              false: splitLink({
                condition: (op) => op.type === 'subscription',
                true: httpSubscriptionLink({
                  url: opts.httpUrl,
                  transformer: superjson,
                }),
                false: httpBatchStreamLink({
                  url: opts.httpUrl,
                  transformer: superjson,
                }),
              }),
            }),
          ],
        };
      },
    });

    type AppRouter = typeof router;
    {
      const err = await waitTRPCClientError<AppRouter>(
        ctx.client.iterable.query(undefined, {
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
        ctx.client.deferred.query(undefined, {
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
    const t = initTRPC.create({
      transformer: superjson,
    });

    const router = t.router({
      iterableWithError: t.procedure.query(async function* () {
        yield 1;
        yield 2;
        throw new Error('foo');
      }),
    });

    await using ctx = testServerAndClientResource(router, {
      server: {},
      client(opts) {
        return {
          links: [
            splitLink({
              condition: (op) => !!op.context['httpBatchLink'],
              true: httpBatchLink({
                url: opts.httpUrl,
                transformer: superjson,
              }),
              false: splitLink({
                condition: (op) => op.type === 'subscription',
                true: httpSubscriptionLink({
                  url: opts.httpUrl,
                  transformer: superjson,
                }),
                false: httpBatchStreamLink({
                  url: opts.httpUrl,
                  transformer: superjson,
                }),
              }),
            }),
          ],
        };
      },
    });

    const iterable = await ctx.client.iterableWithError.query();

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

describe('streamHeader option', () => {
  test('streamHeader: accept sends Accept header without trpc-accept header', async () => {
    const t = initTRPC.create({});

    const router = t.router({
      deferred: t.procedure
        .input(z.object({ wait: z.number() }))
        .query(async (opts) => {
          await new Promise<void>((resolve) =>
            setTimeout(resolve, opts.input.wait * 10),
          );
          return opts.input.wait;
        }),
    });

    const fetchSpy = vi.fn<(url: string, init: RequestInit) => void>();

    await using ctx = testServerAndClientResource(router, {
      server: {},
      client(opts) {
        const nativeFetch = globalThis.fetch;
        return {
          links: [
            httpBatchStreamLink({
              url: opts.httpUrl,
              streamHeader: 'accept',
              fetch(url, init) {
                fetchSpy(url as string, init as RequestInit);
                return nativeFetch(url, init);
              },
            }),
          ],
        };
      },
    });

    const results = await Promise.all([
      ctx.client.deferred.query({ wait: 2 }),
      ctx.client.deferred.query({ wait: 1 }),
    ]);

    expect(results).toEqual([2, 1]);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, init] = fetchSpy.mock.calls[0]!;
    expect(init.headers).toHaveProperty('accept', 'application/jsonl');
    expect(init.headers).not.toHaveProperty('trpc-accept');
  });

  test('streamHeader: trpc-accept sends trpc-accept header without Accept header', async () => {
    const t = initTRPC.create({});

    const router = t.router({
      deferred: t.procedure
        .input(z.object({ wait: z.number() }))
        .query(async (opts) => {
          await new Promise<void>((resolve) =>
            setTimeout(resolve, opts.input.wait * 10),
          );
          return opts.input.wait;
        }),
    });

    const fetchSpy = vi.fn<(url: string, init: RequestInit) => void>();

    await using ctx = testServerAndClientResource(router, {
      server: {},
      client(opts) {
        const nativeFetch = globalThis.fetch;
        return {
          links: [
            httpBatchStreamLink({
              url: opts.httpUrl,
              streamHeader: 'trpc-accept',
              fetch(url, init) {
                fetchSpy(url as string, init as RequestInit);
                return nativeFetch(url, init);
              },
            }),
          ],
        };
      },
    });

    const results = await Promise.all([
      ctx.client.deferred.query({ wait: 2 }),
      ctx.client.deferred.query({ wait: 1 }),
    ]);

    expect(results).toEqual([2, 1]);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, init] = fetchSpy.mock.calls[0]!;
    expect(init.headers).toHaveProperty('trpc-accept', 'application/jsonl');
    expect(init.headers).not.toHaveProperty('accept');
  });

  test('streamHeader defaults to trpc-accept when omitted', async () => {
    const t = initTRPC.create({});

    const router = t.router({
      deferred: t.procedure
        .input(z.object({ wait: z.number() }))
        .query(async (opts) => {
          await new Promise<void>((resolve) =>
            setTimeout(resolve, opts.input.wait * 10),
          );
          return opts.input.wait;
        }),
    });

    const fetchSpy = vi.fn<(url: string, init: RequestInit) => void>();

    await using ctx = testServerAndClientResource(router, {
      server: {},
      client(opts) {
        const nativeFetch = globalThis.fetch;
        return {
          links: [
            httpBatchStreamLink({
              url: opts.httpUrl,
              fetch(url, init) {
                fetchSpy(url as string, init as RequestInit);
                return nativeFetch(url, init);
              },
            }),
          ],
        };
      },
    });

    const results = await Promise.all([
      ctx.client.deferred.query({ wait: 2 }),
      ctx.client.deferred.query({ wait: 1 }),
    ]);

    expect(results).toEqual([2, 1]);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, init] = fetchSpy.mock.calls[0]!;
    expect(init.headers).toHaveProperty('trpc-accept', 'application/jsonl');
    expect(init.headers).not.toHaveProperty('accept');
  });
});
