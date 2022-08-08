import { getServerAndReactClient } from './__reactHelpers';
import { render, waitFor } from '@testing-library/react';
import { EventEmitter } from 'events';
import { konn } from 'konn';
import React, { useState } from 'react';
import { z } from 'zod';
import { initTRPC } from '../src';
import { observable } from '../src/observable';

const ee = new EventEmitter();

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC()({
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
      onEvent: t.procedure.input(z.number()).subscription(({ input }) => {
        return observable<number>((emit) => {
          const onData = (data: number) => emit.next(data + input);
          ee.on('data', onData);
          return () => {
            ee.off('data', onData);
          };
        });
      }),
    });

    return getServerAndReactClient(appRouter);
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

test('useSubscription', async () => {
  const onStartedMock = jest.fn();
  const onDataMock = jest.fn();
  const onErrorMock = jest.fn();

  const { App, proxy } = ctx;

  function MyComponent() {
    const [isOpen, setIsOpen] = useState(false);
    const [value, setValue] = useState<number | null>(null);

    proxy.onEvent.useSubscription(10, {
      enabled: true,
      onStarted: () => {
        onStartedMock();
        setIsOpen(true);
      },
      onData: (result) => {
        onDataMock(result);
        setValue(result);
      },
      onError: onErrorMock,
    });

    if (!isOpen) {
      return <>{'__connecting'}</>;
    }

    if (!value) {
      return <>{'__connected'}</>;
    }

    return <pre>{`__value:${value}`}</pre>;
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );

  await waitFor(() =>
    expect(utils.container).toHaveTextContent(`__connecting`),
  );
  expect(onDataMock).toHaveBeenCalledTimes(0);
  expect(onStartedMock).toHaveBeenCalledTimes(0);
  await waitFor(() => expect(utils.container).toHaveTextContent(`__connected`));
  expect(onStartedMock).toHaveBeenCalledTimes(1);
  ee.emit('data', 20);
  await waitFor(() => expect(utils.container).toHaveTextContent(`__value:30`));
  expect(onDataMock).toHaveBeenCalledTimes(1);
  expect(onErrorMock).toHaveBeenCalledTimes(0);
});
