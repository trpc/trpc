import { getServerAndReactClient } from './__reactHelpers';
import { render, waitFor } from '@testing-library/react';
import { EventEmitter } from 'events';
import { expectTypeOf } from 'expect-type';
import { konn } from 'konn';
import React, { useEffect, useState } from 'react';
import { InfiniteData } from 'react-query';
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
      rootProc: t.procedure.query(() => null),
      post: t.router({
        byId: t.procedure
          .input(
            z.object({
              id: z.string(),
            }),
          )
          .query(() => '__result' as const),
        list: t.procedure
          .input(
            z.object({
              cursor: z.string().optional(),
            }),
          )
          .query(() => '__infResult' as const),
        create: t.procedure
          .input(
            z.object({
              text: z.string(),
            }),
          )
          .mutation(() => `__mutationResult` as const),
        onEvent: t.procedure.input(z.number()).subscription(({ input }) => {
          return observable<number>((emit) => {
            const onData = (data: number) => emit.next(data + input);
            ee.on('data', onData);
            return () => {
              ee.off('data', onData);
            };
          });
        }),
      }),
      /**
       * @deprecated
       */
      deprecatedRouter: t.router({
        /**
         * @deprecated
         */
        deprecatedProcedure: t.procedure.query(() => '..'),
      }),
    });

    return getServerAndReactClient(appRouter);
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

test('useQuery()', async () => {
  const { proxy, App } = ctx;
  function MyComponent() {
    const query1 = proxy.post.byId.useQuery({
      id: '1',
    });

    // @ts-expect-error Should not exist
    proxy.post.byId.useInfiniteQuery;
    const utils = proxy.useContext();

    useEffect(() => {
      utils.post.byId.invalidate();
      // @ts-expect-error Should not exist
      utils.doesNotExist.invalidate();
    }, [utils]);

    if (query1.error) {
      expectTypeOf(query1.error['data']).toMatchTypeOf<{ foo: 'bar' }>();
    }

    if (!query1.data) {
      return <>...</>;
    }

    type TData = typeof query1['data'];
    expectTypeOf<TData>().toMatchTypeOf<'__result'>();

    return <pre>{JSON.stringify(query1.data ?? 'n/a', null, 4)}</pre>;
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );
  await waitFor(() => {
    expect(utils.container).toHaveTextContent(`__result`);
  });
});

test('useInfiniteQuery()', async () => {
  const { App, proxy } = ctx;
  function MyComponent() {
    const query1 = proxy.post.list.useInfiniteQuery({});

    if (!query1.data) {
      return <>...</>;
    }

    type TData = typeof query1['data'];
    expectTypeOf<TData>().toMatchTypeOf<InfiniteData<'__infResult'>>();

    return <pre>{JSON.stringify(query1.data ?? 'n/a', null, 4)}</pre>;
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );
  await waitFor(() => {
    expect(utils.container).toHaveTextContent(`__infResult`);
  });
});

test('useMutation', async () => {
  const { App, proxy } = ctx;
  function MyComponent() {
    const mutation = proxy.post.create.useMutation();

    useEffect(() => {
      mutation.mutate({
        text: 'hello',
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    if (!mutation.data) {
      return <>...</>;
    }

    type TData = typeof mutation['data'];
    expectTypeOf<TData>().toMatchTypeOf<'__mutationResult'>();

    return <pre>{JSON.stringify(mutation.data ?? 'n/a', null, 4)}</pre>;
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );
  await waitFor(() => {
    expect(utils.container).toHaveTextContent(`__mutationResult`);
  });
});

test('deprecated routers', async () => {
  const { proxy, App } = ctx;

  function MyComponent() {
    // FIXME this should have strike-through
    proxy.deprecatedRouter.deprecatedProcedure.useQuery();

    return null;
  }

  render(
    <App>
      <MyComponent />
    </App>,
  );
});

test('useSubscription', async () => {
  const onStartedMock = jest.fn();
  const onDataMock = jest.fn();
  const onErrorMock = jest.fn();

  const { App, proxy } = ctx;

  function MyComponent() {
    const [isOpen, setIsOpen] = useState(false);
    const [value, setValue] = useState<number | null>(null);

    proxy.post.onEvent.useSubscription(10, {
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
