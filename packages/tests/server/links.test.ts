import { routerToServerAndClientNew } from './___testHelpers';
import type { OperationLink, TRPCClientRuntime } from '@trpc/client';
import {
  createTRPCClient,
  httpBatchLink,
  httpLink,
  loggerLink,
  TRPCClientError,
  unstable_httpBatchStreamLink,
} from '@trpc/client';
import { createChain } from '@trpc/client/links/internals/createChain';
import { retryLink } from '@trpc/client/links/internals/retryLink';
import type { AnyRouter } from '@trpc/server';
import { initTRPC } from '@trpc/server';
import { observable, observableToPromise } from '@trpc/server/observable';
import { z } from 'zod';

const mockRuntime: TRPCClientRuntime = {};
test('chainer', async () => {
  let attempt = 0;
  const serverCall = vi.fn();
  const t = initTRPC.create();

  const router = t.router({
    hello: t.procedure.query(({}) => {
      attempt++;
      serverCall();
      if (attempt < 3) {
        throw new Error('Err ' + attempt);
      }
      return 'world';
    }),
  });

  const { httpPort, close } = routerToServerAndClientNew(router);

  const chain = createChain({
    links: [
      retryLink({ retry: (opts) => opts.attempts <= 3 })(mockRuntime),
      httpLink({
        url: `http://localhost:${httpPort}`,
      })(mockRuntime),
    ],
    op: {
      id: 1,
      type: 'query',
      path: 'hello',
      input: null,
      context: {},
      signal: null,
    },
  });

  const result = await observableToPromise(chain);
  expect(result?.context?.['response']).toBeTruthy();
  result.context!['response'] = '[redacted]' as any;
  expect(result).toMatchInlineSnapshot(`
    Object {
      "context": Object {
        "response": "[redacted]",
        "responseJSON": Object {
          "result": Object {
            "data": "world",
          },
        },
      },
      "result": Object {
        "data": "world",
        "type": "data",
      },
    }
  `);

  expect(serverCall).toHaveBeenCalledTimes(3);

  await close();
});

test('cancel request', async () => {
  const onDestroyCall = vi.fn();

  const chain = createChain({
    links: [
      () =>
        observable(() => {
          return () => {
            onDestroyCall();
          };
        }),
    ],
    op: {
      id: 1,
      type: 'query',
      path: 'hello',
      input: null,
      context: {},
      signal: null,
    },
  });

  chain.subscribe({}).unsubscribe();

  expect(onDestroyCall).toHaveBeenCalled();
});

describe('batching', () => {
  test('query batching', async () => {
    const metaCall = vi.fn();

    const t = initTRPC.create();

    const router = t.router({
      hello: t.procedure.input(z.string().nullish()).query(({ input }) => {
        return `hello ${input ?? 'world'}`;
      }),
    });

    const { httpPort, close } = routerToServerAndClientNew(router, {
      server: {
        createContext() {
          metaCall();
          return {};
        },
      },
    });
    const links = [
      httpBatchLink({
        url: `http://localhost:${httpPort}`,
      })(mockRuntime),
    ];
    const chain1 = createChain({
      links,
      op: {
        id: 1,
        type: 'query',
        path: 'hello',
        input: null,
        context: {},
        signal: null,
      },
    });

    const chain2 = createChain({
      links,
      op: {
        id: 2,
        type: 'query',
        path: 'hello',
        input: 'alexdotjs',
        context: {},
        signal: null,
      },
    });

    const results = await Promise.all([
      observableToPromise(chain1),
      observableToPromise(chain2),
    ]);
    for (const res of results) {
      expect(res?.context?.['response']).toBeTruthy();
      res.context!['response'] = '[redacted]';
    }
    expect(results).toMatchInlineSnapshot(`
      Array [
        Object {
          "context": Object {
            "response": "[redacted]",
            "responseJSON": Array [
              Object {
                "result": Object {
                  "data": "hello world",
                },
              },
              Object {
                "result": Object {
                  "data": "hello alexdotjs",
                },
              },
            ],
          },
          "result": Object {
            "data": "hello world",
            "type": "data",
          },
        },
        Object {
          "context": Object {
            "response": "[redacted]",
            "responseJSON": Array [
              Object {
                "result": Object {
                  "data": "hello world",
                },
              },
              Object {
                "result": Object {
                  "data": "hello alexdotjs",
                },
              },
            ],
          },
          "result": Object {
            "data": "hello alexdotjs",
            "type": "data",
          },
        },
      ]
    `);

    expect(metaCall).toHaveBeenCalledTimes(1);

    await close();
  });

  test('query streaming', async () => {
    const metaCall = vi.fn();

    const t = initTRPC.create();

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

    const { httpPort, close } = routerToServerAndClientNew(router, {
      server: {
        createContext() {
          metaCall();
          return {};
        },
      },
    });
    const links = [
      unstable_httpBatchStreamLink({
        url: `http://localhost:${httpPort}`,
      })(mockRuntime),
    ];
    const chain1 = createChain({
      links,
      op: {
        id: 1,
        type: 'query',
        path: 'deferred',
        input: { wait: 2 },
        context: {},
        signal: null,
      },
    });

    const chain2 = createChain({
      links,
      op: {
        id: 2,
        type: 'query',
        path: 'deferred',
        input: { wait: 1 },
        context: {},
        signal: null,
      },
    });

    const results = await Promise.all([
      observableToPromise(chain1),
      observableToPromise(chain2),
    ]);
    for (const res of results) {
      expect(res?.context?.['response']).toBeTruthy();
      res.context!['response'] = '[redacted]';
    }
    expect(results).toMatchInlineSnapshot(`
      Array [
        Object {
          "context": Object {
            "response": "[redacted]",
          },
          "result": Object {
            "data": 2,
          },
        },
        Object {
          "context": Object {
            "response": "[redacted]",
          },
          "result": Object {
            "data": 1,
          },
        },
      ]
    `);

    expect(metaCall).toHaveBeenCalledTimes(1);

    await close();
  });

  test('batching on maxURLLength', async () => {
    const createContextFn = vi.fn();

    const t = initTRPC.create();

    const appRouter = t.router({
      ['big-input']: t.procedure.input(z.string()).query(({ input }) => {
        return input.length;
      }),
    });

    const { client, httpUrl, close, router } = routerToServerAndClientNew(
      appRouter,
      {
        server: {
          createContext() {
            createContextFn();
            return {};
          },
        },
        client: (opts) => ({
          links: [
            httpBatchLink({
              url: opts.httpUrl,
              maxURLLength: 2083,
            }),
          ],
        }),
      },
    );

    {
      // queries should be batched into a single request
      // url length: 118 < 2083
      const res = await Promise.all([
        client['big-input'].query('*'.repeat(10)),
        client['big-input'].query('*'.repeat(10)),
      ]);

      expect(res).toEqual([10, 10]);
      expect(createContextFn).toBeCalledTimes(1);
      createContextFn.mockClear();
    }
    {
      // queries should be sent and individual requests
      // url length: 2146 > 2083
      const res = await Promise.all([
        client['big-input'].query('*'.repeat(1024)),
        client['big-input'].query('*'.repeat(1024)),
      ]);

      expect(res).toEqual([1024, 1024]);
      expect(createContextFn).toBeCalledTimes(2);
      createContextFn.mockClear();
    }
    {
      // queries should be batched into a single request
      // url length: 2146 < 9999
      const clientWithBigMaxURLLength = createTRPCClient<typeof router>({
        links: [httpBatchLink({ url: httpUrl, maxURLLength: 9999 })],
      });

      const res = await Promise.all([
        clientWithBigMaxURLLength['big-input'].query('*'.repeat(1024)),
        clientWithBigMaxURLLength['big-input'].query('*'.repeat(1024)),
      ]);

      expect(res).toEqual([1024, 1024]);
      expect(createContextFn).toBeCalledTimes(1);
    }

    await close();
  });

  test('server not configured for batching', async () => {
    const serverCall = vi.fn();

    const t = initTRPC.create();

    const appRouter = t.router({
      hello: t.procedure.query(({}) => {
        serverCall();
        return 'world';
      }),
    });

    const { close, router, httpPort, trpcClientOptions } =
      routerToServerAndClientNew(appRouter, {
        server: {
          allowBatching: false,
        },
      });
    const client = createTRPCClient<typeof router>({
      ...trpcClientOptions,
      links: [
        httpBatchLink({
          url: `http://localhost:${httpPort}`,
          headers: {},
        }),
      ],
    });

    await expect(client.hello.query()).rejects.toMatchInlineSnapshot(
      `[TRPCClientError: Batching is not enabled on the server]`,
    );

    await close();
  });
});
test('create client with links', async () => {
  let attempt = 0;
  const serverCall = vi.fn();

  const t = initTRPC.create();

  const appRouter = t.router({
    hello: t.procedure.query(({}) => {
      attempt++;
      serverCall();
      if (attempt < 3) {
        throw new Error('Err ' + attempt);
      }
      return 'world';
    }),
  });

  const { close, router, httpPort, trpcClientOptions } =
    routerToServerAndClientNew(appRouter);

  const client = createTRPCClient<typeof router>({
    ...trpcClientOptions,
    links: [
      retryLink({ retry: (opts) => opts.attempts < 3 }),
      httpLink({
        url: `http://localhost:${httpPort}`,
        headers: {},
      }),
    ],
  });

  const result = await client.hello.query();
  expect(result).toBe('world');

  await close();
});

describe('loggerLink', () => {
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
  };
  const logLink = loggerLink({
    console: logger,
  })(mockRuntime);
  const okLink: OperationLink<AnyRouter> = () =>
    observable((o) => {
      o.next({
        result: {
          type: 'data',
          data: undefined,
        },
      });
    });
  const errorLink: OperationLink<AnyRouter> = () =>
    observable((o) => {
      o.error(new TRPCClientError('..'));
    });

  beforeEach(() => {
    logger.error.mockReset();
    logger.log.mockReset();
  });

  test('query', () => {
    createChain({
      links: [logLink, okLink],
      op: {
        id: 1,
        type: 'query',
        input: null,
        path: 'n/a',
        context: {},
        signal: null,
      },
    })
      .subscribe({})
      .unsubscribe();

    expect(logger.log.mock.calls).toHaveLength(2);
    expect(logger.log.mock.calls[0]![0]).toMatchInlineSnapshot(
      `"%c >> query #1 %cn/a%c %O"`,
    );
    expect(logger.log.mock.calls[0]![1]).toMatchInlineSnapshot(`
      "
          background-color: #72e3ff;
          color: black;
          padding: 2px;
        "
    `);
  });

  test('subscription', () => {
    createChain({
      links: [logLink, okLink],
      op: {
        id: 1,
        type: 'subscription',
        input: null,
        path: 'n/a',
        context: {},
        signal: null,
      },
    })
      .subscribe({})
      .unsubscribe();
    expect(logger.log.mock.calls[0]![0]).toMatchInlineSnapshot(
      `"%c >> subscription #1 %cn/a%c %O"`,
    );
    expect(logger.log.mock.calls[1]![0]).toMatchInlineSnapshot(
      `"%c << subscription #1 %cn/a%c %O"`,
    );
  });

  test('mutation', () => {
    createChain({
      links: [logLink, okLink],
      op: {
        id: 1,
        type: 'mutation',
        input: null,
        path: 'n/a',
        context: {},
        signal: null,
      },
    })
      .subscribe({})
      .unsubscribe();

    expect(logger.log.mock.calls[0]![0]).toMatchInlineSnapshot(
      `"%c >> mutation #1 %cn/a%c %O"`,
    );
    expect(logger.log.mock.calls[1]![0]).toMatchInlineSnapshot(
      `"%c << mutation #1 %cn/a%c %O"`,
    );
  });

  test('query 2', () => {
    createChain({
      links: [logLink, errorLink],
      op: {
        id: 1,
        type: 'query',
        input: null,
        path: 'n/a',
        context: {},
        signal: null,
      },
    })
      .subscribe({})
      .unsubscribe();

    expect(logger.log.mock.calls[0]![0]).toMatchInlineSnapshot(
      `"%c >> query #1 %cn/a%c %O"`,
    );
    expect(logger.error.mock.calls[0]![0]).toMatchInlineSnapshot(
      `"%c << query #1 %cn/a%c %O"`,
    );
  });

  test('ansi color mode', () => {
    const logger = {
      error: vi.fn(),
      log: vi.fn(),
    };
    createChain({
      links: [
        loggerLink({ console: logger, colorMode: 'ansi' })(mockRuntime),
        okLink,
      ],
      op: {
        id: 1,
        type: 'query',
        input: null,
        path: 'n/a',
        context: {},
        signal: null,
      },
    })
      .subscribe({})
      .unsubscribe();

    expect(logger.log.mock.calls[0]![0]).toMatchInlineSnapshot(
      `"\x1b[30;46m >> query \x1b[1;30;46m #1 n/a \x1b[0m"`,
    );
    expect(logger.log.mock.calls[1]![0]).toMatchInlineSnapshot(
      `"\x1b[97;46m << query \x1b[1;97;46m #1 n/a \x1b[0m"`,
    );
  });

  test('disabled color mode', () => {
    const logger = {
      error: vi.fn(),
      log: vi.fn(),
    };
    createChain({
      links: [
        loggerLink({ console: logger, colorMode: 'none' })(mockRuntime),
        okLink,
      ],
      op: {
        id: 1,
        type: 'query',
        input: null,
        path: 'n/a',
        context: {},
        signal: null,
      },
    })
      .subscribe({})
      .unsubscribe();

    expect(logger.log.mock.calls[0]![0]).toMatchInlineSnapshot(
      `">> query #1 n/a"`,
    );
    expect(logger.log.mock.calls[1]![0]).toMatchInlineSnapshot(
      `"<< query #1 n/a"`,
    );
  });

  test('disabled color mode with context', () => {
    const logger = {
      error: vi.fn(),
      log: vi.fn(),
    };
    createChain({
      links: [
        loggerLink({ console: logger, colorMode: 'none', withContext: true })(
          mockRuntime,
        ),
        okLink,
      ],
      op: {
        id: 1,
        type: 'query',
        input: null,
        path: 'n/a',
        context: {
          ok: true,
        },
        signal: null,
      },
    })
      .subscribe({})
      .unsubscribe();

    const first = logger.log.mock.calls[0];
    expect(first![0]).toMatchInlineSnapshot(`">> query #1 n/a"`);
    expect(first![1].context).toEqual({ ok: true });
    expect(logger.log.mock.calls[1]![0]).toMatchInlineSnapshot(
      `"<< query #1 n/a"`,
    );
  });

  test('css color mode without context', () => {
    const logger = {
      error: vi.fn(),
      log: vi.fn(),
    };
    createChain({
      links: [
        loggerLink({ console: logger, withContext: false })(mockRuntime),
        okLink,
      ],
      op: {
        id: 1,
        type: 'query',
        input: null,
        path: 'n/a',
        context: {
          ok: true,
        },
        signal: null,
      },
    })
      .subscribe({})
      .unsubscribe();

    const first = logger.log.mock.calls[0];
    expect(first![0]).toMatchInlineSnapshot(`"%c >> query #1 %cn/a%c %O"`);
    expect(first![1].context).toBeUndefined();
    expect(logger.log.mock.calls[1]![0]).toMatchInlineSnapshot(
      `"%c << query #1 %cn/a%c %O"`,
    );
  });

  test('custom logger', () => {
    const logFn = vi.fn();
    createChain({
      links: [loggerLink({ logger: logFn })(mockRuntime), errorLink],
      op: {
        id: 1,
        type: 'query',
        input: null,
        path: 'n/a',
        context: {},
        signal: null,
      },
    })
      .subscribe({})
      .unsubscribe();
    const [firstCall, secondCall] = logFn.mock.calls.map((args) => args[0]);
    expect(firstCall).toMatchInlineSnapshot(`
      Object {
        "context": Object {},
        "direction": "up",
        "id": 1,
        "input": null,
        "path": "n/a",
        "signal": null,
        "type": "query",
      }
    `);
    // omit elapsedMs
    const { elapsedMs, ...other } = secondCall;
    expect(typeof elapsedMs).toBe('number');
    expect(other).toMatchInlineSnapshot(`
      Object {
        "context": Object {},
        "direction": "down",
        "id": 1,
        "input": null,
        "path": "n/a",
        "result": [TRPCClientError: ..],
        "signal": null,
        "type": "query",
      }
    `);
  });
});

test('chain makes unsub', async () => {
  const firstLinkUnsubscribeSpy = vi.fn();
  const firstLinkCompleteSpy = vi.fn();

  const secondLinkUnsubscribeSpy = vi.fn();

  const t = initTRPC.create();

  const appRouter = t.router({
    hello: t.procedure.query(({}) => {
      return 'world';
    }),
  });

  const { client, close } = routerToServerAndClientNew(appRouter, {
    client() {
      return {
        links: [
          () =>
            ({ next, op }) =>
              observable((observer) => {
                next(op).subscribe({
                  error(err) {
                    observer.error(err);
                  },
                  next(v) {
                    observer.next(v);
                  },
                  complete() {
                    firstLinkCompleteSpy();
                    observer.complete();
                  },
                });
                return () => {
                  firstLinkUnsubscribeSpy();
                  observer.complete();
                };
              }),
          () => () =>
            observable((observer) => {
              observer.next({
                result: {
                  type: 'data',
                  data: 'world',
                },
              });
              observer.complete();
              return () => {
                secondLinkUnsubscribeSpy();
              };
            }),
        ],
      };
    },
  });
  expect(await client.hello.query()).toBe('world');
  expect(firstLinkCompleteSpy).toHaveBeenCalledTimes(1);
  expect(firstLinkUnsubscribeSpy).toHaveBeenCalledTimes(1);
  expect(secondLinkUnsubscribeSpy).toHaveBeenCalledTimes(1);
  await close();
});

test('init with URL object', async () => {
  const serverCall = vi.fn();
  const t = initTRPC.create();

  const router = t.router({
    hello: t.procedure.query(({}) => {
      serverCall();
      return 'world';
    }),
  });

  const { httpPort, close } = routerToServerAndClientNew(router);
  const url = new URL(`http://localhost:${httpPort}`);

  const chain = createChain({
    links: [httpLink({ url: url })(mockRuntime)],
    op: {
      id: 1,
      type: 'query',
      path: 'hello',
      input: null,
      context: {},
      signal: null,
    },
  });

  const result = await observableToPromise(chain);
  expect(result?.context?.['response']).toBeTruthy();
  result.context!['response'] = '[redacted]' as any;
  expect(result).toMatchInlineSnapshot(`
    Object {
      "context": Object {
        "response": "[redacted]",
        "responseJSON": Object {
          "result": Object {
            "data": "world",
          },
        },
      },
      "result": Object {
        "data": "world",
        "type": "data",
      },
    }
  `);

  expect(serverCall).toHaveBeenCalledTimes(1);

  await close();
});
