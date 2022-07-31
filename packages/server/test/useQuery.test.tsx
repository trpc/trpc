import { getServerAndReactClient } from './__reactHelpers';
import { render, waitFor } from '@testing-library/react';
import { expectTypeOf } from 'expect-type';
import { konn } from 'konn';
import React, { useEffect } from 'react';
import { InfiniteData } from 'react-query';
import { z } from 'zod';
import { initTRPC } from '../src';
import { jsonContentType } from '../src/content-type';

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC()({
      contentTypes: {
        json: jsonContentType,
      },
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
