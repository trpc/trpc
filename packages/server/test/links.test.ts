/* eslint-disable @typescript-eslint/no-empty-function */
import { routerToServerAndClient } from './__testHelpers';
import { waitFor } from '@testing-library/dom';
import AbortController from 'abort-controller';
import fetch from 'node-fetch';
import { z } from 'zod';
import { TRPCClientError, createTRPCClient } from '../../client/src';
import { executeChain } from '../../client/src/internals/executeChain';
import { LinkRuntimeOptions, OperationLink } from '../../client/src/links/core';
import { httpBatchLink } from '../../client/src/links/httpBatchLink';
import { httpLink } from '../../client/src/links/httpLink';
import { loggerLink } from '../../client/src/links/loggerLink';
import { retryLink } from '../../client/src/links/retryLink';
import { splitLink } from '../../client/src/links/splitLink';
import * as trpc from '../src';
import { AnyRouter } from '../src';

const mockRuntime: LinkRuntimeOptions = {
  transformer: {
    serialize: (obj) => obj,
    deserialize: (obj) => obj,
  },
  fetch: fetch as any,
  AbortController: AbortController as any,
  headers: () => ({}),
};
test('retrylink', () => {
  let attempts = 0;
  const configuredLink = retryLink({ attempts: 5 });

  const ctxLink = configuredLink(mockRuntime);

  const prev = jest.fn();
  ctxLink({
    op: {
      id: 1,
      type: 'query',
      input: null,
      path: '',
      context: {},
    },
    prev: prev,
    next: (_ctx, callback) => {
      attempts++;
      if (attempts < 4) {
        callback(TRPCClientError.from(new Error('..')));
      } else {
        callback({ type: 'data', data: 'succeeded on attempt ' + attempts });
      }
    },
    onDestroy: () => {},
  });
  expect(prev).toHaveBeenCalledTimes(1);
  expect(prev.mock.calls[0][0].data).toBe('succeeded on attempt 4');
});

test('chainer', async () => {
  let attempt = 0;
  const serverCall = jest.fn();
  const { httpPort, close } = routerToServerAndClient(
    trpc.router().query('hello', {
      resolve() {
        attempt++;
        serverCall();
        if (attempt < 3) {
          throw new Error('Errr ' + attempt);
        }
        return 'world';
      },
    }),
  );

  const $result = executeChain({
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

  await waitFor(() => {
    expect($result.get()).not.toBe(null);
  });
  expect($result.get()).toMatchInlineSnapshot(`
    Object {
      "data": "world",
      "type": "data",
    }
  `);

  expect(serverCall).toHaveBeenCalledTimes(3);

  close();
});

test('mock cache link has immediate $result', () => {
  const $result = executeChain({
    links: [
      retryLink({ attempts: 3 })(mockRuntime),
      // mock cache link
      ({ prev }) => {
        prev({ type: 'data', data: 'cached' });
      },
      httpLink({
        url: `void`,
      })(mockRuntime),
    ],
    op: {
      id: 1,
    } as any,
  });
  expect($result.get()).toMatchInlineSnapshot(`
    Object {
      "data": "cached",
      "type": "data",
    }
  `);
});

test('cancel request', async () => {
  const onDestroyCall = jest.fn();

  const $result = executeChain({
    links: [
      ({ onDestroy }) => {
        onDestroy(() => {
          onDestroyCall();
        });
      },
    ],
    op: {
      id: 1,
      type: 'query',
      path: 'hello',
      input: null,
      context: {},
    },
  });

  $result.done();

  expect(onDestroyCall).toHaveBeenCalled();
});

describe('batching', () => {
  test('query batching', async () => {
    const contextCall = jest.fn();
    const { port, close } = routerToServerAndClient(
      trpc.router().query('hello', {
        input: z.string().nullish(),
        resolve({ input }) {
          return `hello ${input ?? 'world'}`;
        },
      }),
      {
        server: {
          createContext() {
            contextCall();
          },
          batching: {
            enabled: true,
          },
        },
      },
    );
    const links = [
      httpBatchLink({
        url: `http://localhost:${port}`,
      })(mockRuntime),
    ];
    const $result1 = executeChain({
      links,
      op: {
        id: 1,
        type: 'query',
        path: 'hello',
        input: null,
        context: {},
      },
    });

    const $result2 = executeChain({
      links,
      op: {
        id: 2,
        type: 'query',
        path: 'hello',
        input: 'alexdotjs',
        context: {},
      },
    });

    await waitFor(() => {
      expect($result1.get()).not.toBe(null);
      expect($result2.get()).not.toBe(null);
    });
    expect($result1.get()).toMatchInlineSnapshot(`
      Object {
        "data": "hello world",
        "type": "data",
      }
    `);
    expect($result2.get()).toMatchInlineSnapshot(`
      Object {
        "data": "hello alexdotjs",
        "type": "data",
      }
    `);

    expect(contextCall).toHaveBeenCalledTimes(1);

    close();
  });

  test('maxBatchSize', async () => {
    const contextCall = jest.fn();
    const { port, close } = routerToServerAndClient(
      trpc.router().query('hello', {
        input: z.string().nullish(),
        resolve({ input }) {
          return `hello ${input ?? 'world'}`;
        },
      }),
      {
        server: {
          createContext() {
            contextCall();
          },
          batching: {
            enabled: true,
          },
        },
      },
    );
    const links = [
      httpBatchLink({
        url: `http://localhost:${port}`,
        maxBatchSize: 2,
      })(mockRuntime),
    ];
    const $result1 = executeChain({
      links,
      op: {
        id: 1,
        type: 'query',
        path: 'hello',
        input: null,
        context: {},
      },
    });

    const $result2 = executeChain({
      links,
      op: {
        id: 2,
        type: 'query',
        path: 'hello',
        input: 'alexdotjs',
        context: {},
      },
    });

    const $result3 = executeChain({
      links,
      op: {
        id: 3,
        type: 'query',
        path: 'hello',
        input: 'again',
        context: {},
      },
    });

    await waitFor(() => {
      expect($result1.get()).not.toBe(null);
      expect($result2.get()).not.toBe(null);
      expect($result3.get()).not.toBe(null);
    });
    expect($result1.get()).toMatchInlineSnapshot(`
      Object {
        "data": "hello world",
        "type": "data",
      }
    `);
    expect($result2.get()).toMatchInlineSnapshot(`
      Object {
        "data": "hello alexdotjs",
        "type": "data",
      }
    `);
    expect($result3.get()).toMatchInlineSnapshot(`
      Object {
        "data": "hello again",
        "type": "data",
      }
    `);

    expect(contextCall).toHaveBeenCalledTimes(2);

    close();
  });

  test('server not configured for batching', async () => {
    const serverCall = jest.fn();
    const { close, router, port, trpcClientOptions } = routerToServerAndClient(
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
          url: `http://localhost:${port}`,
        }),
      ],
      headers: {},
    });

    await expect(client.query('hello')).rejects.toMatchInlineSnapshot(
      `[TRPCClientError: Batching is not enabled on the server]`,
    );

    close();
  });
});
describe('splitLink', () => {
  test('left/right', () => {
    const left = jest.fn();
    const right = jest.fn();
    executeChain({
      links: [
        splitLink({
          left: () => left,
          right: () => right,
          condition(op) {
            return op.type === 'query';
          },
        })(mockRuntime),
      ],
      op: {
        id: 1,
        type: 'query',
        input: null,
        path: '',
        context: {},
      },
    });
    expect(left).toHaveBeenCalledTimes(1);
    expect(right).toHaveBeenCalledTimes(0);
  });

  test('true/false', () => {
    const trueLink = jest.fn();
    const falseLink = jest.fn();
    executeChain({
      links: [
        splitLink({
          true: () => trueLink,
          false: () => falseLink,
          condition(op) {
            return op.type === 'query';
          },
        })(mockRuntime),
      ],
      op: {
        id: 1,
        type: 'query',
        input: null,
        path: '',
        context: {},
      },
    });
    expect(trueLink).toHaveBeenCalledTimes(1);
    expect(falseLink).toHaveBeenCalledTimes(0);
  });
});
test('create client with links', async () => {
  let attempt = 0;
  const serverCall = jest.fn();
  const { close, router, port, trpcClientOptions } = routerToServerAndClient(
    trpc.router().query('hello', {
      resolve() {
        attempt++;
        serverCall();
        if (attempt < 3) {
          throw new Error('Errr ' + attempt);
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
        url: `http://localhost:${port}`,
      }),
    ],
    headers: {},
  });

  const $result = await client.query('hello');
  expect($result).toBe('world');

  close();
});

test('multi down link', async () => {
  const $result = executeChain({
    links: [
      // mock cache link
      ({ prev, onDestroy }) => {
        const timer = setTimeout(() => {
          prev({ type: 'data', data: 'cached2' });
        }, 1);
        onDestroy(() => {
          clearTimeout(timer);
        });
        prev({ type: 'data', data: 'cached1' });
      },
      httpLink({
        url: `void`,
      })(mockRuntime),
    ],
    op: {
      id: 1,
    } as any,
  });
  expect($result.get()).toMatchInlineSnapshot(`
    Object {
      "data": "cached1",
      "type": "data",
    }
  `);
  await waitFor(() => {
    expect($result.get()).toMatchInlineSnapshot(`
      Object {
        "data": "cached1",
        "type": "data",
      }
    `);
  });
});

test('loggerLink', () => {
  const logger = {
    error: jest.fn(),
    log: jest.fn(),
  };
  const logLink = loggerLink({
    console: logger,
  })(mockRuntime);
  const okLink: OperationLink<AnyRouter> = ({ prev }) =>
    prev({ type: 'data', data: undefined });
  const errorLink: OperationLink<AnyRouter> = ({ prev }) =>
    prev(TRPCClientError.from(new Error('..')));
  {
    executeChain({
      links: [logLink, okLink],
      op: {
        id: 1,
        type: 'query',
        input: null,
        path: 'n/a',
        context: {},
      },
    });

    expect(logger.log.mock.calls[0][0]).toMatchInlineSnapshot(
      `"%c >> query #1 %cn/a%c %O"`,
    );
    expect(logger.log.mock.calls[1][0]).toMatchInlineSnapshot(
      `"%c << query #1 %cn/a%c %O"`,
    );
    logger.error.mockReset();
    logger.log.mockReset();
  }

  {
    executeChain({
      links: [logLink, okLink],
      op: {
        id: 1,
        type: 'subscription',
        input: null,
        path: 'n/a',
        context: {},
      },
    });
    expect(logger.log.mock.calls[0][0]).toMatchInlineSnapshot(
      `"%c >> subscription #1 %cn/a%c %O"`,
    );
    expect(logger.log.mock.calls[1][0]).toMatchInlineSnapshot(
      `"%c << subscription #1 %cn/a%c %O"`,
    );
    logger.error.mockReset();
    logger.log.mockReset();
  }

  {
    executeChain({
      links: [logLink, okLink],
      op: {
        id: 1,
        type: 'mutation',
        input: null,
        path: 'n/a',
        context: {},
      },
    });

    expect(logger.log.mock.calls[0][0]).toMatchInlineSnapshot(
      `"%c >> mutation #1 %cn/a%c %O"`,
    );
    expect(logger.log.mock.calls[1][0]).toMatchInlineSnapshot(
      `"%c << mutation #1 %cn/a%c %O"`,
    );
    logger.error.mockReset();
    logger.log.mockReset();
  }

  {
    executeChain({
      links: [logLink, errorLink],
      op: {
        id: 1,
        type: 'query',
        input: null,
        path: 'n/a',
        context: {},
      },
    });
    expect(logger.log.mock.calls[0][0]).toMatchInlineSnapshot(
      `"%c >> query #1 %cn/a%c %O"`,
    );
    expect(logger.error.mock.calls[0][0]).toMatchInlineSnapshot(
      `"%c << query #1 %cn/a%c %O"`,
    );
    logger.error.mockReset();
    logger.log.mockReset();
  }

  // custom logger
  {
    const logFn = jest.fn();
    executeChain({
      links: [loggerLink({ logger: logFn })(mockRuntime), errorLink],
      op: {
        id: 1,
        type: 'query',
        input: null,
        path: 'n/a',
        context: {},
      },
    });
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
  }
});

test('pass a context', () => {
  const context = {
    hello: 'there',
  };
  const callback = jest.fn();
  executeChain({
    links: [
      ({ op }) => {
        callback(op.context);
      },
    ],
    op: {
      id: 1,
      type: 'query',
      input: null,
      path: '',
      context,
    },
  });
  expect(callback).toHaveBeenCalledWith(context);
});

test('pass a context', () => {
  const context = {
    hello: 'there',
  };
  const callback = jest.fn();
  executeChain({
    links: [
      ({ op }) => {
        callback(op.context);
      },
    ],
    op: {
      id: 1,
      type: 'query',
      input: null,
      path: '',
      context,
    },
  });
  expect(callback).toHaveBeenCalledWith(context);
});

test('subscriptions throw error on httpLinks', () => {
  {
    // httpLink
    expect(() => {
      executeChain({
        links: [httpLink({ url: 'void' })(mockRuntime)],
        op: {
          id: 1,
          type: 'subscription',
          input: null,
          path: '',
          context: {},
        },
      });
    }).toThrowError(
      'Subscriptions are not supported over HTTP, please add a Websocket link',
    );
  }
  {
    // httpBatchLink
    expect(() => {
      executeChain({
        links: [httpBatchLink({ url: 'void' })(mockRuntime)],
        op: {
          id: 1,
          type: 'subscription',
          input: null,
          path: '',
          context: {},
        },
      });
    }).toThrowError(
      'Subscriptions are not supported over HTTP, please add a Websocket link',
    );
  }
});
