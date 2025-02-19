import { EventEmitter, on } from 'node:events';
import { testReactResource } from './__helpers';
import { fireEvent, waitFor } from '@testing-library/react';
import { unstable_httpSubscriptionLink, wsLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { makeResource } from '@trpc/server/unstable-core-do-not-import';
import * as React from 'react';
import { describe, expect, expectTypeOf, test, vi } from 'vitest';
import { z } from 'zod';
import type { TRPCSubscriptionResult } from '../src';
import { useSubscription } from '../src';

/* eslint-disable no-console */
export const suppressLogs = () => {
  const log = console.log;
  const error = console.error;
  const noop = () => {
    // ignore
  };
  console.log = noop;
  console.error = noop;

  function cleanup() {
    console.log = log;
    console.error = error;
  }

  return makeResource(cleanup, cleanup);
};

/**
 * Pause logging until the promise resolves or throws
 */
export const suppressLogsUntil = async (fn: () => Promise<void>) => {
  using _ = suppressLogs();

  await fn();
};

/**
 * a function that displays the diff over time in a list of values
 */
function diff(list: any[]) {
  return list.map((item, index) => {
    if (index === 0) return item;

    const prev = list[index - 1]!;
    const diff = {} as any;
    for (const key in item) {
      if (item[key] !== prev[key]) {
        diff[key] = item[key];
      }
    }
    return diff;
  });
}

const getCtx = (protocol: 'http' | 'ws') => {
  const ee = new EventEmitter();
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
  const appRouter = t.router({
    onEventIterable: t.procedure
      .input(z.number())
      .subscription(async function* (opts) {
        for await (const event of on(ee, 'data', {
          signal: opts.signal,
        })) {
          const data = event[0] as number;
          yield data + opts.input;
        }
      }),
    /**
     * @deprecated delete in v12
     */
    onEventObservable: t.procedure
      .input(z.number())
      .subscription(({ input }) => {
        return observable<number>((emit) => {
          const onData = (data: number) => {
            emit.next(data + input);
          };
          ee.on('data', onData);
          return () => {
            ee.off('data', onData);
          };
        });
      }),
  });

  const ctx = testReactResource(appRouter, {
    client(opts) {
      return {
        links: [
          protocol === 'http'
            ? unstable_httpSubscriptionLink({
                url: opts.httpUrl,
              })
            : wsLink({
                client: opts.wsClient,
              }),
        ],
      };
    },
  });

  return {
    ...ctx,
    ee,
  };
};

describe.each([
  //
  'http',
  'ws',
] as const)('useSubscription - %s', (protocol) => {
  test('iterable', async () => {
    await using ctx = getCtx(protocol);
    const onDataMock = vi.fn();
    const onErrorMock = vi.fn();

    const { useTRPC } = ctx;

    function MyComponent() {
      const [enabled, setEnabled] = React.useState(true);

      const trpc = useTRPC();
      const result = useSubscription(
        trpc.onEventIterable.subscriptionOptions(10, {
          enabled,
          onData: (data) => {
            expectTypeOf(data).toMatchTypeOf<number>();
            onDataMock(data);
          },
          onError: onErrorMock,
        }),
      );

      return (
        <>
          <button
            onClick={() => {
              setEnabled((it) => !it);
            }}
            data-testid="toggle-enabled"
          >
            toggle enabled
          </button>
          <div>status:{result.status}</div>
          <div>error:{result.error?.message}</div>
          <div>data:{result.data ?? 'NO_DATA'}</div>
        </>
      );
    }

    const utils = ctx.renderApp(<MyComponent />);

    await waitFor(() => {
      expect(utils.container).toHaveTextContent(`status:connecting`);
    });
    expect(onDataMock).toHaveBeenCalledTimes(0);
    await waitFor(() => {
      expect(utils.container).toHaveTextContent(`status:pending`);
    });
    ctx.ee.emit('data', 20);

    await waitFor(() => {
      expect(utils.container).toHaveTextContent(`data:30`);
    });

    await waitFor(() => {
      expect(onDataMock).toHaveBeenCalledTimes(1);
    });
    expect(onDataMock.mock.calls[0]?.[0]).toEqual(30);
    expect(onDataMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock).toHaveBeenCalledTimes(0);

    fireEvent.click(utils.getByTestId('toggle-enabled'));

    await waitFor(() => {
      if (protocol === 'http') {
        expect(ctx.onReqAborted).toHaveBeenCalledTimes(1);
      } else {
        ctx.wsClient.close();
        expect(ctx.wss.clients.size).toBe(0);
      }
    });

    // we need to emit data to trigger unsubscribe
    ctx.ee.emit('data', 40);

    await waitFor(() => {
      // no event listeners
      expect(ctx.ee.listenerCount('data')).toBe(0);
    });
  });

  test('observable()', async () => {
    await using ctx = getCtx(protocol);

    const onDataMock = vi.fn();
    const onErrorMock = vi.fn();

    const { useTRPC } = ctx;

    function MyComponent() {
      const [data, setData] = React.useState<number>();
      const [enabled, setEnabled] = React.useState(true);

      const trpc = useTRPC();
      const result = useSubscription(
        trpc.onEventObservable.subscriptionOptions(10, {
          enabled: enabled,
          onData: (data) => {
            expectTypeOf(data).toMatchTypeOf<number>();
            onDataMock(data);
            setData(data);
          },
          onError: onErrorMock,
        }),
      );

      return (
        <>
          <button
            onClick={() => {
              setEnabled((it) => !it);
            }}
            data-testid="toggle-enabled"
          >
            toggle enabled
          </button>
          <div>status:{result.status}</div>
          <div>data:{data ?? 'NO_DATA'}</div>
        </>
      );
    }

    const utils = ctx.renderApp(<MyComponent />);

    await waitFor(() => {
      expect(utils.container).toHaveTextContent(`status:pending`);
    });
    ctx.ee.emit('data', 20);
    await waitFor(() => {
      expect(utils.container).toHaveTextContent(`data:30`);
    });
    expect(onDataMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock).toHaveBeenCalledTimes(0);

    fireEvent.click(utils.getByTestId('toggle-enabled'));

    await waitFor(() => {
      // no event listeners
      expect(ctx.ee.listenerCount('data')).toBe(0);
    });
  });
});

describe('connection state - http', () => {
  test('iterable', async () => {
    await using ctx = getCtx('http');
    const { useTRPC } = ctx;

    const queryResult: unknown[] = [];

    function MyComponent() {
      const trpc = useTRPC();
      const result = useSubscription(
        trpc.onEventIterable.subscriptionOptions(10, {
          onData: () => {
            // noop
          },
        }),
      );

      queryResult.push({
        ...result,
      });

      return (
        <>
          <>status:{result.status}</>
          <>data:{result.data}</>
        </>
      );
    }

    const utils = ctx.renderApp(<MyComponent />);

    await waitFor(() => {
      expect(utils.container).toHaveTextContent(`status:pending`);
    });
    // emit
    ctx.ee.emit('data', 20);

    await waitFor(() => {
      expect(utils.container).toHaveTextContent(`data:30`);
    });

    expect(diff(queryResult)).toMatchInlineSnapshot(`
      Array [
        Object {
          "data": undefined,
          "error": null,
          "reset": [Function],
          "status": "connecting",
        },
        Object {
          "status": "pending",
        },
        Object {
          "data": 30,
        },
      ]
    `);
    queryResult.length = 0;

    await suppressLogsUntil(async () => {
      ctx.destroyConnections();

      await waitFor(() => {
        expect(utils.container).toHaveTextContent('status:connecting');
      });
    });

    await waitFor(
      () => {
        expect(utils.container).toHaveTextContent('status:pending');
      },
      {
        timeout: 5_000,
      },
    );

    expect(diff(queryResult)).toMatchInlineSnapshot(`
      Array [
        Object {
          "data": 30,
          "error": [TRPCClientError: Unknown error],
          "reset": [Function],
          "status": "connecting",
        },
        Object {
          "error": null,
          "status": "pending",
        },
      ]
    `);

    queryResult.length = 0;
    // emit
    ctx.ee.emit('data', 40);

    await waitFor(() => {
      expect(utils.container).toHaveTextContent('data:50');
    });
    expect(diff(queryResult)).toMatchInlineSnapshot(`
      Array [
        Object {
          "data": 50,
          "error": null,
          "reset": [Function],
          "status": "pending",
        },
      ]
    `);

    utils.unmount();
  });
});

describe('reset - http', () => {
  test('iterable', async () => {
    await using ctx = getCtx('http');
    const { useTRPC } = ctx;

    const queryResult: TRPCSubscriptionResult<number, unknown>[] = [];

    function MyComponent() {
      const trpc = useTRPC();
      const result = useSubscription(
        trpc.onEventIterable.subscriptionOptions(10, {
          onData: () => {
            // noop
          },
        }),
      );

      queryResult.push({
        ...result,
      });

      return (
        <>
          <>status:{result.status}</>
          <>data:{result.data}</>
          {/* reset button */}
          <button
            onClick={() => {
              result.reset();
            }}
            data-testid="reset"
          >
            reset
          </button>
        </>
      );
    }

    const utils = ctx.renderApp(<MyComponent />);

    await waitFor(() => {
      expect(utils.container).toHaveTextContent(`status:pending`);
    });
    // emit
    ctx.ee.emit('data', 20);

    await waitFor(() => {
      expect(utils.container).toHaveTextContent(`data:30`);
    });

    queryResult.length = 0;

    // click reset
    fireEvent.click(utils.getByTestId('reset'));
    await waitFor(() => {
      expect(utils.container).toHaveTextContent('status:connecting');
    });

    expect(queryResult[0]?.data).toBeUndefined();

    await waitFor(() => {
      expect(utils.container).toHaveTextContent('status:pending');
    });

    expect(diff(queryResult)).toMatchInlineSnapshot(`
      Array [
        Object {
          "data": undefined,
          "error": null,
          "reset": [Function],
          "status": "connecting",
        },
        Object {
          "status": "pending",
        },
      ]
    `);

    utils.unmount();
  });
});
