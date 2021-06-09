/* eslint-disable @typescript-eslint/no-empty-function */
import { waitFor } from '@testing-library/dom';
import AbortController from 'abort-controller';
import fetch from 'node-fetch';
import { z } from 'zod';
import { createTRPCClient } from '../../client/src';
import { executeChain } from '../../client/src/internals/executeChain';
import { LinkRuntimeOptions, OperationLink } from '../../client/src/links/core';
import { httpBatchLink } from '../../client/src/links/httpBatchLink';
import { httpLink } from '../../client/src/links/httpLink';
import { retryLink } from '../../client/src/links/retryLink';
import { loggerLink } from '../../client/src/links/loggerLink';
import { splitLink } from '../../client/src/links/splitLink';
import * as trpc from '../src';
import { routerToServerAndClient } from './_testHelpers';

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
        callback({
          ok: false,
          error: new Error('Some error'),
          statusCode: 200,
        });
      } else {
        callback({
          ok: true,
          data: 'succeeded on attempt ' + attempts,
          statusCode: 200,
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
    },
  });

  await waitFor(() => {
    const value = $result.get();
    expect(value).toMatchObject({
      data: 'world',
    });
  });

  expect(serverCall).toHaveBeenCalledTimes(3);

  close();
});

test('mock cache link has immediate $result', () => {
  const $result = executeChain({
    links: [
      retryLink({ attempts: 3 })(mockRuntime),
      // mock cache link
      ({ prev }) => {
        prev({ ok: true, data: 'cached', statusCode: 200 });
      },
      httpLink({
        url: `void`,
      })(mockRuntime),
    ],
    op: {} as any,
  });
  expect($result.get()).toMatchObject({
    data: 'cached',
  });
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
    },
  });

  $result.destroy();

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
      },
    });

    const $result2 = executeChain({
      links,
      op: {
        type: 'query',
        path: 'hello',
        input: 'alexdotjs',
      },
    });

    await waitFor(() => {
      expect($result1.get()).not.toBeNull();
      expect($result2.get()).not.toBeNull();
    });
    expect($result1.get()).toMatchObject({
      data: 'hello world',
    });
    expect($result2.get()).toMatchObject({
      data: 'hello alexdotjs',
    });

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
      `[Error: Batching is not enabled on the server]`,
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
          prev({ ok: true, data: 'cached2', statusCode: 200 });
        }, 1);
        onDestroy(() => {
          clearTimeout(timer);
        });
        prev({ ok: true, data: 'cached1', statusCode: 200 });
      },
      httpLink({
        url: `void`,
      })(mockRuntime),
    ],
    op: {} as any,
  });
  expect($result.get()).toMatchObject({
    data: 'cached1',
  });
  await waitFor(() => {
    expect($result.get()).toMatchObject({
      data: 'cached2',
    });
  });
});

test('loggerLink', () => {
  const logger = {
    error: jest.fn(),
    log: jest.fn(),
  };
  const logLink = loggerLink({
    logger,
  })(mockRuntime);
  const okLink: OperationLink = ({ prev }) =>
    prev({ ok: true, statusCode: 200, data: null });
  const errorLink: OperationLink = ({ prev }) =>
    prev({ ok: false, statusCode: 400, error: null });
  {
    executeChain({
      links: [logLink, okLink],
      op: {
        type: 'query',
        input: null,
        path: 'n/a',
      },
    });
    expect(logger.log.mock.calls[0][0]).toMatchInlineSnapshot(
      `"%c ⏳ >> query #1 %cn/a%c %O"`,
    );
    expect(logger.log.mock.calls[1][0]).toMatchInlineSnapshot(
      `"%c ✅ << query #1 %cn/a%c %O"`,
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
      },
    });
    expect(logger.log.mock.calls[0][0]).toMatchInlineSnapshot(
      `"%c ⏳ >> subscription #2 %cn/a%c %O"`,
    );
    expect(logger.log.mock.calls[1][0]).toMatchInlineSnapshot(
      `"%c ✅ << subscription #2 %cn/a%c %O"`,
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
      },
    });

    expect(logger.log.mock.calls[0][0]).toMatchInlineSnapshot(
      `"%c ⏳ >> mutation #3 %cn/a%c %O"`,
    );
    expect(logger.log.mock.calls[1][0]).toMatchInlineSnapshot(
      `"%c ✅ << mutation #3 %cn/a%c %O"`,
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
      },
    });
    expect(logger.log.mock.calls[0][0]).toMatchInlineSnapshot(
      `"%c ⏳ >> query #4 %cn/a%c %O"`,
    );
    expect(logger.error.mock.calls[0][0]).toMatchInlineSnapshot(
      `"%c ❌ << query #4 %cn/a%c %O"`,
    );
    logger.error.mockReset();
    logger.log.mockReset();
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
