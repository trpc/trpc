import { EventEmitter, on } from 'node:events';
import { getServerAndReactClient } from './__helpers';
import { fireEvent, waitFor } from '@testing-library/react';
import { initTRPC } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import * as React from 'react';
import { describe, expect, expectTypeOf, test, vi } from 'vitest';
import { z } from 'zod';
import type { TRPCSubscriptionResult } from '../src';
import { useSubscription } from '../src';

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

  return {
    ...getServerAndReactClient(appRouter, {
      subscriptions: protocol,
    }),
    ee,
  };
};

describe.each([
  //
  'http',
  'ws',
] as const)('useSubscription - %s', (protocol) => {
  test.only('iterable', async () => {
    await using ctx = getCtx(protocol);
    const onDataMock = vi.fn();
    const onErrorMock = vi.fn();

    const { useTRPC } = ctx;

    let setEnabled = null as never as (enabled: boolean) => void;

    function MyComponent() {
      const [isStarted, setIsStarted] = React.useState(false);
      const [data, setData] = React.useState<number>();
      const [enabled, _setEnabled] = React.useState(true);
      setEnabled = _setEnabled;

      const trpc = useTRPC();
      useSubscription(
        trpc.onEventIterable.subscriptionOptions(10, {
          enabled,
          onStarted: () => {
            setIsStarted(true);
          },
          onData: (data) => {
            expectTypeOf(data).toMatchTypeOf<number>();
            onDataMock(data);
            setData(data);
          },
          onError: onErrorMock,
        }),
      );

      if (!isStarted) {
        return <>{'__connecting'}</>;
      }

      if (!data) {
        return <>{'__connected'}</>;
      }

      return <pre>{`__data:${data}`}</pre>;
    }

    const utils = ctx.renderApp(<MyComponent />);

    await waitFor(() => {
      expect(utils.container).toHaveTextContent(`__connecting`);
    });
    expect(onDataMock).toHaveBeenCalledTimes(0);
    await waitFor(() => {
      expect(utils.container).toHaveTextContent(`__connected`);
    });
    ctx.ee.emit('data', 20);

    await waitFor(() => {
      expect(onDataMock).toHaveBeenCalledTimes(1);
    });
    expect(onDataMock.mock.calls[0]?.[0]).toEqual(30);
    await waitFor(() => {
      expect(utils.container).toHaveTextContent(`__data:30`);
    });
    expect(onDataMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock).toHaveBeenCalledTimes(0);

    setEnabled(false);

    await waitFor(() => {
      if (protocol === 'http') {
        expect(ctx.opts.onReqAborted).toHaveBeenCalledTimes(1);
      } else {
        ctx.opts.wsClient.close();
        expect(ctx.opts.wss.clients.size).toBe(0);
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
    let setEnabled = null as never as (enabled: boolean) => void;

    function MyComponent() {
      const [isStarted, setIsStarted] = React.useState(false);
      const [data, setData] = React.useState<number>();
      const [enabled, _setEnabled] = React.useState(true);
      setEnabled = _setEnabled;

      const trpc = useTRPC();
      useSubscription(
        trpc.onEventObservable.subscriptionOptions(10, {
          enabled: enabled,
          onStarted: () => {
            setIsStarted(true);
          },
          onData: (data) => {
            expectTypeOf(data).toMatchTypeOf<number>();
            onDataMock(data);
            setData(data);
          },
          onError: onErrorMock,
        }),
      );

      if (!isStarted) {
        return <>{'__connecting'}</>;
      }

      if (!data) {
        return <>{'__connected'}</>;
      }

      return <pre>{`__data:${data}`}</pre>;
    }

    const utils = ctx.renderApp(<MyComponent />);

    await waitFor(() => {
      expect(utils.container).toHaveTextContent(`__connecting`);
    });
    expect(onDataMock).toHaveBeenCalledTimes(0);
    await waitFor(() => {
      expect(utils.container).toHaveTextContent(`__connected`);
    });
    ctx.ee.emit('data', 20);
    await waitFor(() => {
      expect(utils.container).toHaveTextContent(`__data:30`);
    });
    expect(onDataMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock).toHaveBeenCalledTimes(0);

    setEnabled(false);

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

    ctx.opts.destroyConnections();

    await waitFor(() => {
      expect(utils.container).toHaveTextContent('status:connecting');
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
