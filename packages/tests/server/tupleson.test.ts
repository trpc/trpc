import EventEmitter from 'node:events';
import { routerToServerAndClientNew } from './___testHelpers';
import { waitFor } from '@testing-library/dom';
import { TRPCLink } from '@trpc/client';
import { experimental_httpTuplesonLink } from '@trpc/client/links/httpTuplesonLink';
import { initTRPC, TRPCError } from '@trpc/server';
import { observable, Observer } from '@trpc/server/observable';
import { konn } from 'konn';
import superjson from 'superjson';
import { tsonBigint, TsonOptions } from 'tupleson';
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
        'trpc-stream': 'tupleson-json',
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
        'trpc-stream': 'tupleson-json',
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

describe.todo('with tupleson transformer', () => {
  const orderedResults: number[] = [];
  const tuplesonOptions: TsonOptions = {
    nonce: () => '__tson',
    types: [tsonBigint],
  };
  const ctx = konn()
    .beforeEach(() => {
      const t = initTRPC.create({
        transformer: 'tupleson', // <------- help, idk if this is the right thing
        experimental_tuplesonOptions: tuplesonOptions,
      });
      orderedResults.length = 0;

      const router = t.router({
        q: t.procedure.input(z.bigint()).query(async (opts) => {
          return {
            input: opts.input,
            inputAsPromise: Promise.resolve(opts.input),
          };
        }),
      });

      const opts = routerToServerAndClientNew(router, {
        server: {},
        client(opts) {
          return {
            links: [
              experimental_httpTuplesonLink({
                url: opts.httpUrl,
                // should we pass tupleson options here?
              }),
            ],
            transformer: tuplesonOptions, // <------- help, idk if this is the right thing
          };
        },
      });
      return opts;
    })
    .afterEach(async (opts) => {
      await opts?.close?.();
    })
    .done();

  test('tupleson as transformer', async () => {
    const { proxy } = ctx;

    const result = await proxy.q.query(1n);
    expect(result.input).toBe(1n);

    expectTypeOf(result).toMatchTypeOf<bigint>();

    const unwrapped = await result.inputAsPromise;

    expectTypeOf(unwrapped).toMatchTypeOf<bigint>();
    expect(unwrapped).toBe(1n);
  });
});

describe.todo('subscriptions', () => {
  type Message = {
    id: string;
  };
  const orderedResults: number[] = [];
  const ctx = konn()
    .beforeEach(() => {
      const t = initTRPC.create({
        experimental_tuplesonOptions: {
          nonce: () => '__tson',
        },
      });
      const ee = new EventEmitter();

      const subRef: {
        current: Observer<Message, unknown>;
      } = {} as any;
      const onNewMessageSubscription = vi.fn();
      const subscriptionEnded = vi.fn();
      const onNewClient = vi.fn();

      const router = t.router({
        onMessage: t.procedure
          .input(z.string().nullish())
          .subscription(({}) => {
            const sub = observable<Message>((emit) => {
              subRef.current = emit;
              const onMessage = (data: Message) => {
                emit.next(data);
              };
              ee.on('server:msg', onMessage);
              return () => {
                subscriptionEnded();
                ee.off('server:msg', onMessage);
              };
            });
            ee.emit('subscription:created');
            onNewMessageSubscription();
            return sub;
          }),
      });
      const opts = routerToServerAndClientNew(router, {
        server: {},
        client(opts) {
          return {
            links: [
              experimental_httpTuplesonLink({
                url: opts.httpUrl,
              }),
            ],
          };
        },
      });
      return {
        ...opts,

        ee,
        subRef,
        onNewMessageSubscription,
        subscriptionEnded,
        onNewClient,
      };
    })
    .afterEach(async (opts) => {
      await opts?.close?.();
    })
    .done();

  test('basic subscription test', async () => {
    ctx.ee.once('subscription:created', () => {
      setTimeout(() => {
        ctx.ee.emit('server:msg', {
          id: '1',
        });
        ctx.ee.emit('server:msg', {
          id: '2',
        });
      });
    });
    const onStartedMock = vi.fn();
    const onDataMock = vi.fn();
    const subscription = ctx.proxy.onMessage.subscribe(undefined, {
      onStarted() {
        onStartedMock();
      },
      onData(data) {
        expectTypeOf(data).not.toBeAny();
        expectTypeOf(data).toMatchTypeOf<Message>();
        onDataMock(data);
      },
    });

    await waitFor(() => {
      expect(onStartedMock).toHaveBeenCalledTimes(1);
      expect(onDataMock).toHaveBeenCalledTimes(2);
    });

    ctx.ee.emit('server:msg', {
      id: '2',
    });
    await waitFor(() => {
      expect(onDataMock).toHaveBeenCalledTimes(3);
    });

    expect(onDataMock.mock.calls).toMatchInlineSnapshot(`
    Array [
      Array [
        Object {
          "id": "1",
        },
      ],
      Array [
        Object {
          "id": "2",
        },
      ],
      Array [
        Object {
          "id": "2",
        },
      ],
    ]
  `);

    subscription.unsubscribe();
    await waitFor(() => {
      expect(ctx.ee.listenerCount('server:msg')).toBe(0);
      expect(ctx.ee.listenerCount('server:error')).toBe(0);
    });
  });
});
