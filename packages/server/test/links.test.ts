/* eslint-disable @typescript-eslint/no-empty-function */
import { waitFor } from '@testing-library/dom';
import AbortController from 'abort-controller';
import fetch from 'node-fetch';
import { z } from 'zod';
import { createTRPCClient, TRPCClientError } from '../../client/src';
import { executeChain } from '../../client/src/internals/executeChain';
import { LinkRuntimeOptions, OperationLink } from '../../client/src/links/core';
import { httpBatchLink } from '../../client/src/links/httpBatchLink';
import { httpLink } from '../../client/src/links/httpLink';
import { retryLink } from '../../client/src/links/retryLink';
import { loggerLink } from '../../client/src/links/loggerLink';
import { splitLink } from '../../client/src/links/splitLink';
import * as trpc from '../src';
import { routerToServerAndClient } from './_testHelpers';
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
        callback({
          ok: true,
          data: 'succeeded on attempt ' + attempts,
        });
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
  const { port, close } = routerToServerAndClient(
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
        url: `http://localhost:${port}`,
      })(mockRuntime),
    ],
    op: {
      type: 'query',
      path: 'hello',
      input: null,
      context: {},
    },
  });

  await waitFor(() => {
    expect($result.get().type).not.toBe('init');
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
        prev({ ok: true, data: 'cached' });
      },
      httpLink({
        url: `void`,
      })(mockRuntime),
    ],
    op: {} as any,
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
        url: `http://localhost:${port}`,
      })(mockRuntime),
    ];
    const $result1 = executeChain({
      links,
      op: {
        type: 'query',
        path: 'hello',
        input: null,
        context: {},
      },
    });

    const $result2 = executeChain({
      links,
      op: {
        type: 'query',
        path: 'hello',
        input: 'alexdotjs',
        context: {},
      },
    });

    await waitFor(() => {
      expect($result1.get().type).not.toBe('init');
      expect($result2.get().type).not.toBe('init');
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

test('split link', () => {
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
      type: 'query',
      input: null,
      path: '',
      context: {},
    },
  });
  expect(left).toHaveBeenCalledTimes(1);
  expect(right).toHaveBeenCalledTimes(0);
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
          prev({ ok: true, data: 'cached2' });
        }, 1);
        onDestroy(() => {
          clearTimeout(timer);
        });
        prev({ ok: true, data: 'cached1' });
      },
      httpLink({
        url: `void`,
      })(mockRuntime),
    ],
    op: {} as any,
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
    prev({ ok: true, data: null });
  const errorLink: OperationLink<AnyRouter> = ({ prev }) =>
    prev(TRPCClientError.from(new Error('..')));
  {
    executeChain({
      links: [logLink, okLink],
      op: {
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
        type: 'subscription',
        input: null,
        path: 'n/a',
        context: {},
      },
    });
    expect(logger.log.mock.calls[0][0]).toMatchInlineSnapshot(
      `"%c >> subscription #2 %cn/a%c %O"`,
    );
    expect(logger.log.mock.calls[1][0]).toMatchInlineSnapshot(
      `"%c << subscription #2 %cn/a%c %O"`,
    );
    logger.error.mockReset();
    logger.log.mockReset();
  }

  {
    executeChain({
      links: [logLink, okLink],
      op: {
        type: 'mutation',
        input: null,
        path: 'n/a',
        context: {},
      },
    });

    expect(logger.log.mock.calls[0][0]).toMatchInlineSnapshot(
      `"%c >> mutation #3 %cn/a%c %O"`,
    );
    expect(logger.log.mock.calls[1][0]).toMatchInlineSnapshot(
      `"%c << mutation #3 %cn/a%c %O"`,
    );
    logger.error.mockReset();
    logger.log.mockReset();
  }

  {
    executeChain({
      links: [logLink, errorLink],
      op: {
        type: 'query',
        input: null,
        path: 'n/a',
        context: {},
      },
    });
    expect(logger.log.mock.calls[0][0]).toMatchInlineSnapshot(
      `"%c >> query #4 %cn/a%c %O"`,
    );
    expect(logger.error.mock.calls[0][0]).toMatchInlineSnapshot(
      `"%c << query #4 %cn/a%c %O"`,
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
        "input": null,
        "path": "n/a",
        "requestId": 1,
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
        "input": null,
        "path": "n/a",
        "requestId": 1,
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
      type: 'query',
      input: null,
      path: '',
      context,
    },
  });
  expect(callback).toHaveBeenCalledWith(context);
});
