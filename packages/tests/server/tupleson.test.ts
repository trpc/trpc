import { routerToServerAndClientNew } from './___testHelpers';
import { TRPCLink } from '@trpc/client';
import { experimental_httpTuplesonLink } from '@trpc/client/links/httpTuplesonLink';
import { initTRPC, TRPCError } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { konn } from 'konn';
import superjson from 'superjson';
import { z } from 'zod';

describe('no transformer', () => {
  const orderedResults: number[] = [];
  const ctx = konn()
    .beforeEach(() => {
      const t = initTRPC.create({
        experimental_tuplesonOptions: {
          nonce: () => '__tson',
        },
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
        error: t.procedure.query(() => {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        }),
        iterator: t.procedure.query(async function* iterator() {
          for (const i of [1, 2, 3]) {
            await new Promise<void>((resolve) => setTimeout(resolve, i * 10));
            yield i;
          }
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
              experimental_httpTuplesonLink({
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

  test('test a raw fetch request', async () => {
    const url =
      ctx.httpUrl +
      `/deferred,deferred?batch=1&input=${encodeURIComponent(
        JSON.stringify({
          0: { wait: 1 },
          1: { wait: 2 },
        }),
      )}`;

    const res = await fetch(url, {
      headers: {
        'trpc-batch-mode': 'tupleson-json',
      },
    });

    const stream = res.body!;
    const result: string[] = [];

    // parse each thing with text decoder
    const decoder = new TextDecoder();

    for await (const chunk of stream as any) {
      result.push(decoder.decode(chunk));
    }

    const json = JSON.parse(result.join(''));

    expect(json).toMatchInlineSnapshot(`
      Array [
        Object {
          "json": Array [
            Array [
              "Promise",
              0,
              "__tson",
            ],
            Array [
              "Promise",
              1,
              "__tson",
            ],
          ],
          "nonce": "__tson",
        },
        Array [
          Array [
            0,
            Array [
              0,
              Object {
                "result": Object {
                  "data": 1,
                },
              },
            ],
          ],
          Array [
            1,
            Array [
              0,
              Object {
                "result": Object {
                  "data": 2,
                },
              },
            ],
          ],
        ],
      ]
    `);
  });

  test('test a raw iterator', async () => {
    const url = ctx.httpUrl + `/iterator?batch=1&input={}`;

    const res = await fetch(url, {
      headers: {
        'trpc-batch-mode': 'tupleson-json',
      },
    });

    const stream = res.body!;
    const result: string[] = [];

    // parse each thing with text decoder
    const decoder = new TextDecoder();

    for await (const chunk of stream as any) {
      result.push(decoder.decode(chunk));
    }

    const json = JSON.parse(result.join(''));

    expect(json).toMatchInlineSnapshot(`
      Array [
        Object {
          "json": Array [
            Array [
              "Promise",
              0,
              "__tson",
            ],
          ],
          "nonce": "__tson",
        },
        Array [
          Array [
            0,
            Array [
              0,
              Object {
                "result": Object {
                  "data": Array [
                    "AsyncIterable",
                    1,
                    "__tson",
                  ],
                },
              },
            ],
          ],
          Array [
            1,
            Array [
              0,
              1,
            ],
          ],
          Array [
            1,
            Array [
              0,
              2,
            ],
          ],
          Array [
            1,
            Array [
              0,
              3,
            ],
          ],
          Array [
            1,
            Array [
              2,
            ],
          ],
        ],
      ]
    `);
  });

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
  test('out-of-order streaming with error', async () => {
    const { proxy } = ctx;

    const results = await Promise.allSettled([
      proxy.deferred.query({ wait: 1 }),
      proxy.error.query(),
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
});

describe('with transformer', () => {
  const orderedResults: number[] = [];
  const ctx = konn()
    .beforeEach(() => {
      const t = initTRPC.create({
        transformer: superjson,
        experimental_tuplesonOptions: {
          nonce: () => '__tson',
        },
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
        error: t.procedure.query(() => {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
        }),
        iterator: t.procedure.query(async function* iterator() {
          for (const i of [1, 2, 3]) {
            await new Promise<void>((resolve) => setTimeout(resolve, i * 10));
            yield i;
          }
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
              experimental_httpTuplesonLink({
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
  test('out-of-order streaming with error', async () => {
    const { proxy } = ctx;

    const results = await Promise.allSettled([
      proxy.deferred.query({ wait: 1 }),
      proxy.error.query(),
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

  test('async iterator', async () => {
    const { proxy } = ctx;

    const results = await proxy.iterator.query();

    const resultsArray = [];
    for await (const result of results) {
      resultsArray.push(result);
    }
    expect(resultsArray).toMatchInlineSnapshot(`
      Array [
        1,
        2,
        3,
      ]
    `);
  });
});
