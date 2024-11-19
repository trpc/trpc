import { EventEmitter, on } from 'node:events';
import { getServerAndReactClient, ignoreErrors } from './__helpers';
import { waitFor } from '@testing-library/react';
import { initTRPC } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import * as React from 'react';
import { describe, expect, expectTypeOf, test, vi } from 'vitest';
import { z } from 'zod';
import { useSubscription } from '../src';

describe.each([
  //
  'http',
  'ws',
] as const)('useSubscription - %s', (protocol) => {
  const ee = new EventEmitter();

  const testContext = () => {
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
  };

  test('useSubscription - iterable', async () => {
    await using ctx = testContext();
    const { useTRPC } = ctx;

    const onDataMock = vi.fn();
    const onErrorMock = vi.fn();

    let setEnabled = null as never as (enabled: boolean) => void;

    function MyComponent() {
      const [isStarted, setIsStarted] = React.useState(false);
      const [data, setData] = React.useState<number>();
      const [enabled, _setEnabled] = React.useState(true);
      setEnabled = _setEnabled;

      const trpc = useTRPC();
      const options = trpc.onEventIterable.subscriptionOptions(10, {
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
      expect(options.trpc.path).toBe('onEventIterable');

      useSubscription(options);

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
    await using ctx = testContext();
    const { useTRPC } = ctx;

    const onDataMock = vi.fn();
    const onErrorMock = vi.fn();

    let setEnabled = null as never as (enabled: boolean) => void;

    function MyComponent() {
      const [isStarted, setIsStarted] = React.useState(false);
      const [data, setData] = React.useState<number>();
      const [enabled, _setEnabled] = React.useState(true);
      setEnabled = _setEnabled;

      const trpc = useTRPC();
      const options = trpc.onEventObservable.subscriptionOptions(10, {
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

      useSubscription(options);

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
