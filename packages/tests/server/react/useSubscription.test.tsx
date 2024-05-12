import { EventEmitter, on } from 'events';
import { ignoreErrors } from '../___testHelpers';
import { getServerAndReactClient } from './__reactHelpers';
import { render, waitFor } from '@testing-library/react';
import type { SSEChunk } from '@trpc/server';
import { initTRPC } from '@trpc/server';
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
        experimental: {
          iterablesAndDeferreds: true,
          sseSubscriptions: true,
        },
      });
      const appRouter = t.router({
        onEvent: t.procedure
          .input(z.number())
          .subscription(async function* ({ input }) {
            for await (const data of on(ee, 'data')) {
              yield {
                data: (data[0] as number) + input,
              } satisfies SSEChunk;
            }
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

  test('useSubscription', async () => {
    const onDataMock = vi.fn();
    const onErrorMock = vi.fn();

    const { App, client } = ctx;

    let setEnabled = null as never as (enabled: boolean) => void;

    function MyComponent() {
      const [isStarted, setIsStarted] = useState(false);
      const [data, setData] = useState<{ data: number }>();
      const [enabled, _setEnabled] = useState(true);
      setEnabled = _setEnabled;

      client.onEvent.useSubscription(10, {
        enabled,
        onStarted: () => {
          setIsStarted(true);
        },
        onData: (data) => {
          expectTypeOf(data).toMatchTypeOf<{ data: number }>();
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

      return <pre>{`__data:${data.data}`}</pre>;
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
});
