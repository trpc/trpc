import { getServerAndReactClient } from './__reactHelpers';
import { render, waitFor } from '@testing-library/react';
import { inferReactQueryProcedureOptions } from '@trpc/react-query';
import { initTRPC } from '@trpc/server/src';
import { expectTypeOf } from 'expect-type';
import { konn } from 'konn';
import React, { useEffect } from 'react';
import { z } from 'zod';

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
      post: t.router({
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

test('useMutation', async () => {
  const { App, proxy } = ctx;
  function MyComponent() {
    const mutation = proxy.post.create.useMutation();

    expect(mutation.trpc.path).toBe('post.create');

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

test('useMutation options inference', () => {
  const { appRouter, proxy, App } = ctx;

  type ReactQueryProcedure = inferReactQueryProcedureOptions<typeof appRouter>;
  type Options = ReactQueryProcedure['post']['create'];
  type OptionsRequired = Required<Options>;

  type OnSuccessData = Parameters<OptionsRequired['onSuccess']>[0];
  expectTypeOf<OnSuccessData>().toMatchTypeOf<'__mutationResult'>();

  type OnSuccessVariables = Parameters<OptionsRequired['onSuccess']>[1];
  expectTypeOf<OnSuccessVariables>().toMatchTypeOf<{ text: string }>();

  function MyComponent() {
    const options: Options = {};
    proxy.post.create.useMutation(options);

    return <></>;
  }

  render(
    <App>
      <MyComponent />
    </App>,
  );
});
