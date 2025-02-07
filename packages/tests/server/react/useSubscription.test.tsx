import { EventEmitter, on } from 'events';
import {
  ignoreErrors,
  suppressLogs,
  suppressLogsUntil,
} from '../___testHelpers';
import { getServerAndReactClient } from './__reactHelpers';
import { skipToken } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react';
import type { TRPCSubscriptionResult } from '@trpc/react-query/shared';
import { initTRPC, sse } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { konn } from 'konn';
import React, { useState } from 'react';
import { z } from 'zod';

const returnSymbol = Symbol();

interface MyEvents {
  data: (str: Error | number | typeof returnSymbol) => void;
}
declare interface MyEventEmitter {
  on<TEv extends keyof MyEvents>(event: TEv, listener: MyEvents[TEv]): this;
  off<TEv extends keyof MyEvents>(event: TEv, listener: MyEvents[TEv]): this;
  once<TEv extends keyof MyEvents>(event: TEv, listener: MyEvents[TEv]): this;
  emit<TEv extends keyof MyEvents>(
    event: TEv,
    ...args: Parameters<MyEvents[TEv]>
  ): boolean;
}

class MyEventEmitter extends EventEmitter {
  public toIterable<TEv extends keyof MyEvents>(
    event: TEv,
    opts: NonNullable<Parameters<typeof on>[2]>,
  ): AsyncIterable<Parameters<MyEvents[TEv]>> {
    return on(this, event, opts) as any;
  }
}

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
  return konn()
    .beforeEach(() => {
      const ee = new MyEventEmitter();
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
            for await (const [data] of ee.toIterable('data', {
              signal: opts.signal,
            })) {
              if (data instanceof Error) {
                throw data;
              }
              if (data === returnSymbol) {
                return;
              }

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
              const onData: MyEvents['data'] = (data) => {
                if (typeof data !== 'number') {
                  throw new Error('Invalid data');
                }
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
    })
    .afterEach(async (ctx) => {
      await ctx?.close?.();
    })
    .done();
};
describe.each([
  //
  // 'http',
  'ws',
] as const)('useSubscription - %s', (protocol) => {
  const ctx = getCtx(protocol);

  test('iterable', async () => {
    const onDataMock = vi.fn();
    const onErrorMock = vi.fn();

    const { App, client } = ctx;

    let setEnabled = null as never as (enabled: boolean) => void;

    function MyComponent() {
      const [isStarted, setIsStarted] = useState(false);
      const [data, setData] = useState<number>();
      const [enabled, _setEnabled] = useState(true);
      setEnabled = _setEnabled;

      client.onEventIterable.useSubscription(10, {
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
      });

      if (!isStarted) {
        return <>{'__connecting'}</>;
      }

      if (!data) {
        return <>{'__connected'}</>;
      }

      return <pre>{`__data:${data}`}</pre>;
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );

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
    ignoreErrors(() => {
      setEnabled(false);
    });

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

  test.only('iterable - return from server', async () => {
    const onDataMock = vi.fn();
    const onErrorMock = vi.fn();
    const onCompletedMock = vi.fn();

    const { App, client } = ctx;

    let setEnabled = null as never as (enabled: boolean) => void;

    function MyComponent() {
      const [data, setData] = useState<number[]>();
      const [enabled, _setEnabled] = useState(false);
      setEnabled = _setEnabled;

      const sub = client.onEventIterable.useSubscription(10, {
        enabled,
        onData: (data) => {
          expectTypeOf(data).toMatchTypeOf<number>();
          onDataMock(data);
          setData((prev) => [...(prev ?? []), data]);
        },
        onError: onErrorMock,
        onComplete: onCompletedMock,
      });

      return (
        <pre>
          <div>status:{sub.status}</div>
          <div>All data: {data?.join(',') ?? 'EMPTY'}</div>
        </pre>
      );
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );

    await waitFor(() => {
      expect(utils.container).toHaveTextContent(`status:idle`);
    });

    ignoreErrors(() => {
      setEnabled(true);
    });
    await waitFor(() => {
      expect(utils.container).toHaveTextContent(`status:connecting`);
    });
    expect(onDataMock).toHaveBeenCalledTimes(0);
    await waitFor(() => {
      expect(utils.container).toHaveTextContent(`status:pending`);
    });
    ctx.ee.emit('data', 20);

    await waitFor(() => {
      expect(utils.container).toHaveTextContent(`All data: 30`);
    });

    ctx.ee.emit('data', returnSymbol);
    await waitFor(() => {
      expect(utils.container).toHaveTextContent(`status:idle`);
    });

    expect(onCompletedMock).toHaveBeenCalledTimes(1);

    ignoreErrors(() => {
      setEnabled(false);
    });
  });

  test('observable()', async () => {
    const onDataMock = vi.fn();
    const onErrorMock = vi.fn();

    const { App, client } = ctx;
    let setEnabled = null as never as (enabled: boolean) => void;

    function MyComponent() {
      const [isStarted, setIsStarted] = useState(false);
      const [data, setData] = useState<number>();
      const [enabled, _setEnabled] = useState(true);
      setEnabled = _setEnabled;

      client.onEventIterable.useSubscription(10, {
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
      });

      if (!isStarted) {
        return <>{'__connecting'}</>;
      }

      if (!data) {
        return <>{'__connected'}</>;
      }

      return <pre>{`__data:${data}`}</pre>;
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );

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

    ignoreErrors(() => {
      setEnabled(false);
    });

    await waitFor(() => {
      // no event listeners
      expect(ctx.ee.listenerCount('data')).toBe(0);
    });
  });
});

describe('connection state - http', () => {
  const ctx = getCtx('http');

  test('iterable', async () => {
    const { App, client } = ctx;

    const queryResult: unknown[] = [];

    function MyComponent() {
      const result = client.onEventIterable.useSubscription(10);

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

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );

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
  const ctx = getCtx('http');

  test('iterable', async () => {
    const queryResult: TRPCSubscriptionResult<number, unknown>[] = [];

    function MyComponent() {
      const result = ctx.client.onEventIterable.useSubscription(10);

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

    const utils = render(
      <ctx.App>
        <MyComponent />
      </ctx.App>,
    );

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
