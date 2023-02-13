import { legacyRouterToServerAndClient } from './__legacyRouterToServerAndClient';
import {
  OperationLink,
  TRPCClientError,
  TRPCClientRuntime,
  createTRPCClient,
  httpBatchLink,
  httpLink,
  loggerLink,
} from '@trpc/client/src';
import { createChain } from '@trpc/client/src/links/internals/createChain';
import { retryLink } from '@trpc/client/src/links/retryLink';
import * as trpc from '@trpc/server/src';
import { AnyRouter } from '@trpc/server/src';
import { observable, observableToPromise } from '@trpc/server/src/observable';
import { z } from 'zod';

const mockRuntime: TRPCClientRuntime = {
  transformer: {
    serialize: (v) => v,
    deserialize: (v) => v,
  },
};
test('chainer', async () => {
  let attempt = 0;
  const serverCall = jest.fn();
  const { httpPort, close } = legacyRouterToServerAndClient(
    trpc.router().query('hello', {
      resolve() {
        attempt++;
        serverCall();
        if (attempt < 3) {
          throw new Error('Err ' + attempt);
        }
        return 'world';
      },
    }),
  );

  const chain = createChain({
    links: [
      retryLink({ attempts: 3 })(mockRuntime),
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
    },
  });

  const result = await observableToPromise(chain).promise;
  expect(result?.context?.response).toBeTruthy();
  result.context!.response = '[redacted]' as any;
  expect(result).toMatchInlineSnapshot(`
    Object {
      "context": Object {
        "response": "[redacted]",
      },
      "result": Object {
        "data": "world",
        "type": "data",
      },
    }
  `);

  expect(serverCall).toHaveBeenCalledTimes(3);

  close();
});

test('cancel request', async () => {
  const onDestroyCall = jest.fn();

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
    },
  });

  chain.subscribe({}).unsubscribe();

  expect(onDestroyCall).toHaveBeenCalled();
});

describe('batching', () => {
  test('query batching', async () => {
    const metaCall = jest.fn();
    const { httpPort, close } = legacyRouterToServerAndClient(
      trpc.router().query('hello', {
        input: z.string().nullish(),
        resolve({ input }) {
          return `hello ${input ?? 'world'}`;
        },
      }),
      {
        server: {
          createContext() {
            metaCall();
            return {};
          },
          batching: {
            enabled: true,
          },
        },
      },
    );
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
      },
    });

    const results = await Promise.all([
      observableToPromise(chain1).promise,
      observableToPromise(chain2).promise,
    ]);
    for (const res of results) {
      expect(res?.context?.response).toBeTruthy();
      res.context!.response = '[redacted]';
    }
    expect(results).toMatchInlineSnapshot(`
      Array [
        Object {
          "context": Object {
            "response": "[redacted]",
          },
          "result": Object {
            "data": "hello world",
            "type": "data",
          },
        },
        Object {
          "context": Object {
            "response": "[redacted]",
          },
          "result": Object {
            "data": "hello alexdotjs",
            "type": "data",
          },
        },
      ]
    `);

    expect(metaCall).toHaveBeenCalledTimes(1);

    close();
  });

  test('batching on maxURLLength', async () => {
    const createContextFn = jest.fn();
    const { client, httpUrl, close, router } = legacyRouterToServerAndClient(
      trpc.router().query('big-input', {
        input: z.string(),
        resolve({ input }) {
          return input.length;
        },
      }),
      {
        server: {
          createContext() {
            createContextFn();
            return {};
          },
          batching: {
            enabled: true,
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
        client.query('big-input', '*'.repeat(10)),
        client.query('big-input', '*'.repeat(10)),
      ]);

      expect(res).toEqual([10, 10]);
      expect(createContextFn).toBeCalledTimes(1);
      createContextFn.mockClear();
    }
    {
      // queries should be sent and individual requests
      // url length: 2146 > 2083
      const res = await Promise.all([
        client.query('big-input', '*'.repeat(1024)),
        client.query('big-input', '*'.repeat(1024)),
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
        clientWithBigMaxURLLength.query('big-input', '*'.repeat(1024)),
        clientWithBigMaxURLLength.query('big-input', '*'.repeat(1024)),
      ]);

      expect(res).toEqual([1024, 1024]);
      expect(createContextFn).toBeCalledTimes(1);
    }

    close();
  });

  test('server not configured for batching', async () => {
    const serverCall = jest.fn();
    const { close, router, httpPort, trpcClientOptions } =
      legacyRouterToServerAndClient(
        trpc.router().query('hello', {
          resolve() {
            serverCall();
            return 'world';
          },
        }),
        {
          server: {
            batching: {
              enabled: false,
            },
          },
        },
      );
    const client = createTRPCClient<typeof router>({
      ...trpcClientOptions,
      links: [
        httpBatchLink({
          url: `http://localhost:${httpPort}`,
          headers: {},
        }),
      ],
    });

    await expect(client.query('hello')).rejects.toMatchInlineSnapshot(
      `[TRPCClientError: Batching is not enabled on the server]`,
    );

    close();
  });
});
test('create client with links', async () => {
  let attempt = 0;
  const serverCall = jest.fn();
  const { close, router, httpPort, trpcClientOptions } =
    legacyRouterToServerAndClient(
      trpc.router().query('hello', {
        resolve() {
          attempt++;
          serverCall();
          if (attempt < 3) {
            throw new Error('Err ' + attempt);
          }
          return 'world';
        },
      }),
    );
  const client = createTRPCClient<typeof router>({
    ...trpcClientOptions,
    links: [
      retryLink({ attempts: 3 }),
      httpLink({
        url: `http://localhost:${httpPort}`,
        headers: {},
      }),
    ],
  });

  const result = await client.query('hello');
  expect(result).toBe('world');

  close();
});

describe('loggerLink', () => {
  const logger = {
    error: jest.fn(),
    log: jest.fn(),
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
      },
    })
      .subscribe({})
      .unsubscribe();

    expect(logger.log.mock.calls).toHaveLength(2);
    expect(logger.log.mock.calls[0]![0]!).toMatchInlineSnapshot(
      `"%c >> query #1 %cn/a%c %O"`,
    );
    expect(logger.log.mock.calls[0][1]).toMatchInlineSnapshot(`
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
      },
    })
      .subscribe({})
      .unsubscribe();
    expect(logger.log.mock.calls[0]![0]!).toMatchInlineSnapshot(
      `"%c >> subscription #1 %cn/a%c %O"`,
    );
    expect(logger.log.mock.calls[1]![0]!).toMatchInlineSnapshot(
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
      },
    })
      .subscribe({})
      .unsubscribe();

    expect(logger.log.mock.calls[0]![0]!).toMatchInlineSnapshot(
      `"%c >> mutation #1 %cn/a%c %O"`,
    );
    expect(logger.log.mock.calls[1]![0]!).toMatchInlineSnapshot(
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
      },
    })
      .subscribe({})
      .unsubscribe();

    expect(logger.log.mock.calls[0]![0]!).toMatchInlineSnapshot(
      `"%c >> query #1 %cn/a%c %O"`,
    );
    expect(logger.error.mock.calls[0]![0]!).toMatchInlineSnapshot(
      `"%c << query #1 %cn/a%c %O"`,
    );
  });

  test('custom logger', () => {
    const logFn = jest.fn();
    createChain({
      links: [loggerLink({ logger: logFn })(mockRuntime), errorLink],
      op: {
        id: 1,
        type: 'query',
        input: null,
        path: 'n/a',
        context: {},
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
        "type": "query",
      }
    `);
  });
});

test('chain makes unsub', async () => {
  const firstLinkUnsubscribeSpy = jest.fn();
  const firstLinkCompleteSpy = jest.fn();

  const secondLinkUnsubscribeSpy = jest.fn();

  const router = trpc.router().query('hello', {
    resolve() {
      return 'world';
    },
  });
  const { client, close } = legacyRouterToServerAndClient(router, {
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
  expect(await client.query('hello')).toBe('world');
  expect(firstLinkCompleteSpy).toHaveBeenCalledTimes(1);
  expect(firstLinkUnsubscribeSpy).toHaveBeenCalledTimes(1);
  expect(secondLinkUnsubscribeSpy).toHaveBeenCalledTimes(1);
  close();
});
