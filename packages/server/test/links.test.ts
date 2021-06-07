/* eslint-disable @typescript-eslint/no-empty-function */
import { waitFor } from '@testing-library/dom';
import AbortController from 'abort-controller';
import fetch from 'node-fetch';
import { z } from 'zod';
import { LinkRuntimeOptions } from '../../client/src/links/core';
import { createChain } from '../../client/src/internals/createChain';

import {
  dataLoader,
  httpBatchLink,
} from '../../client/src/links/httpBatchLink';
import { createTRPCClient } from '../../client/src';
import { httpLink } from '../../client/src/links/httpLink';
import { retryLink } from '../../client/src/links/retryLink';
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

  const chain = createChain([
    retryLink({ attempts: 3 })(mockRuntime),
    httpLink({
      url: `http://localhost:${port}`,
    })(mockRuntime),
  ]);

  const result = chain.call({
    type: 'query',
    path: 'hello',
    input: null,
  });

  await waitFor(() => {
    const value = result.get();
    expect(value).toMatchObject({
      data: 'world',
    });
  });

  expect(serverCall).toHaveBeenCalledTimes(3);

  close();
});

test('mock cache link has immediate result', () => {
  const chain = createChain([
    retryLink({ attempts: 3 })(mockRuntime),
    // mock cache link
    ({ prev }) => {
      prev({ ok: true, data: 'cached', statusCode: 200 });
    },
    httpLink({
      url: `void`,
    })(mockRuntime),
  ]);
  const result = chain.call({} as any);
  expect(result.get()).toMatchObject({
    data: 'cached',
  });
});

test('cancel request', async () => {
  const onDestroyCall = jest.fn();

  const chain = createChain([
    ({ onDestroy }) => {
      onDestroy(() => {
        onDestroyCall();
      });
    },
  ]);

  const result = chain.call({
    type: 'query',
    path: 'hello',
    input: null,
  });

  result.destroy();

  expect(onDestroyCall).toHaveBeenCalled();
});

describe('batching', () => {
  test('dataloader basic', async () => {
    const fetchManyCalled = jest.fn();
    const loader = dataLoader<number, number>(function fetchMany(keys) {
      fetchManyCalled();
      const promise = new Promise<number[]>((resolve) => {
        resolve(keys.map((v) => v + 1));
      });
      return { promise, cancel: () => {} };
    });
    {
      const result = await Promise.all([
        loader.load(1).promise,
        loader.load(2).promise,
      ]);
      expect(result).toEqual([2, 3]);
    }
    {
      const result = await Promise.all([
        loader.load(3).promise,
        loader.load(4).promise,
      ]);
      expect(result).toEqual([4, 5]);
    }
    expect(fetchManyCalled).toHaveBeenCalledTimes(2);
  });

  test('dataloader cancellation', async () => {
    const fetchManyCalled = jest.fn();
    const cancelCalled = jest.fn();
    const loader = dataLoader<number, number>(function fetchMany(keys) {
      fetchManyCalled();
      const promise = new Promise<number[]>((resolve) => {
        setTimeout(() => {
          resolve(keys.map((v) => v + 1));
        }, 10);
      });

      return { promise, cancel: cancelCalled };
    });

    {
      // immediate, before it's actually executed
      const res1 = loader.load(1);
      const res2 = loader.load(2);

      res1.cancel();
      res2.cancel();

      expect(cancelCalled).toHaveBeenCalledTimes(0);
    }
    {
      // after some time
      const res1 = loader.load(2);
      const res2 = loader.load(3);

      await new Promise((resolve) => setTimeout(resolve, 5));

      res1.cancel();
      res2.cancel();

      await waitFor(() => {
        expect(cancelCalled).toHaveBeenCalledTimes(1);
      });
    }
  });

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

    const chain = createChain([
      httpBatchLink({
        url: `http://localhost:${port}`,
      })(mockRuntime),
    ]);

    const result1 = chain.call({
      type: 'query',
      path: 'hello',
      input: null,
    });

    const result2 = chain.call({
      type: 'query',
      path: 'hello',
      input: 'alexdotjs',
    });

    await waitFor(() => {
      expect(result1.get()).not.toBeNull();
      expect(result2.get()).not.toBeNull();
    });
    expect(result1.get()).toMatchObject({
      data: 'hello world',
    });
    expect(result2.get()).toMatchObject({
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
  const chain = createChain([
    splitLink({
      left: () => left,
      right: () => right,
      condition(op) {
        return op.type === 'query';
      },
    })(mockRuntime),
  ]);
  chain.call({
    type: 'query',
    input: null,
    path: '',
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

  const result = await client.query('hello');
  expect(result).toBe('world');

  close();
});
