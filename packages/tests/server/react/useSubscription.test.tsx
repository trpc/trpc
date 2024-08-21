import { EventEmitter, on } from 'events';
import { ignoreErrors } from '../___testHelpers';
import { getServerAndReactClient } from './__reactHelpers';
import { render, waitFor } from '@testing-library/react';
import { initTRPC, sse } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { konn } from 'konn';
import React, { useState } from 'react';
import { z } from 'zod';

describe.each([
  //
  'http',
  'ws',
] as const)('useSubscription - %s', (protocol) => {
  const ee = new EventEmitter();

  const ctx = konn()
    .beforeEach(() => {
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
          .subscription(async function* ({ input }) {
            for await (const event of on(ee, 'data')) {
              const data = event[0] as number;
              yield data + input;
            }
          }),
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

      return getServerAndReactClient(appRouter, {
        subscriptions: protocol,
      });
    })
    .afterEach(async (ctx) => {
      await ctx?.close?.();
    })
    .done();

  test('useSubscription - iterable', async () => {
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
    ee.emit('data', 20);

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
    ee.emit('data', 40);

    await waitFor(() => {
      // no event listeners
      expect(ee.listenerCount('data')).toBe(0);
    });
  });

  test('useSubscription - observable()', async () => {
    const onDataMock = vi.fn();
    const onErrorMock = vi.fn();

    const { App, client } = ctx;
    let setEnabled = null as never as (enabled: boolean) => void;

    function MyComponent() {
      const [isStarted, setIsStarted] = useState(false);
      const [data, setData] = useState<number>();
      const [enabled, _setEnabled] = useState(true);
      setEnabled = _setEnabled;

      client.onEventObservable.useSubscription(10, {
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
    ee.emit('data', 20);
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
      expect(ee.listenerCount('data')).toBe(0);
    });
  });
});
