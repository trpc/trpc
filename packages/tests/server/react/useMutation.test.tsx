import { getServerAndReactClient } from './__reactHelpers';
import { render, waitFor } from '@testing-library/react';
import type { inferReactQueryProcedureOptions } from '@trpc/react-query';
import { initTRPC } from '@trpc/server';
import { createDeferred } from '@trpc/server/unstable-core-do-not-import';
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
    let iterableDeferred = createDeferred<void>();
    const nextIterable = () => {
      iterableDeferred.resolve();
      iterableDeferred = createDeferred();
    };
    const appRouter = t.router({
      post: t.router({
        create: t.procedure
          .input(
            z.object({
              text: z.string(),
            }),
          )
          .mutation(() => '__mutationResult' as const),
        createWithSerializable: t.procedure
          .input(
            z.object({
              text: z.string(),
            }),
          )
          .mutation(({ input }) => ({
            id: 1,
            text: input.text,
            date: new Date(),
          })),
      }),

      iterable: t.procedure.mutation(async function* () {
        for (let i = 0; i < 3; i++) {
          await iterableDeferred.promise;
          yield i + 1;
        }
      }),
    });

    return { ...getServerAndReactClient(appRouter), nextIterable };
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

test('useMutation', async () => {
  const { App, client } = ctx;
  function MyComponent() {
    const mutation = client.post.create.useMutation();

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

    type TData = (typeof mutation)['data'];
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
  const { appRouter, client, App } = ctx;

  type ReactQueryProcedure = inferReactQueryProcedureOptions<typeof appRouter>;
  type Options = ReactQueryProcedure['post']['createWithSerializable'];
  type OptionsRequired = Required<Options>;

  type OnSuccessVariables = Parameters<OptionsRequired['onSuccess']>[1];
  expectTypeOf<OnSuccessVariables>().toMatchTypeOf<{ text: string }>();

  function MyComponent() {
    const options: Options = {};
    client.post.createWithSerializable.useMutation({
      ...options,
      onSuccess: (data) => {
        expectTypeOf(data).toMatchTypeOf<{
          id: number;
          text: string;
          date: string;
        }>();
      },
    });

    return <></>;
  }

  render(
    <App>
      <MyComponent />
    </App>,
  );
});

test('useMutation async iterable', async () => {
  const { App, client } = ctx;
  const states: {
    status: string;
    data: unknown;
    isPending: boolean;
  }[] = [];
  const mutateAsyncValues: number[] = [];
  function MyComponent() {
    const mutation = client.iterable.useMutation({
      trpc: {
        context: {
          stream: 1,
        },
      },
    });

    useEffect(() => {
      mutation.mutateAsync().then(async (it) => {
        for await (const value of it) {
          mutateAsyncValues.push(value);
        }
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!mutation.data) {
      return <>...</>;
    }
    ctx.nextIterable();

    states.push({
      data: mutation.data,
      status: mutation.status,
      isPending: mutation.isPending,
    });
    expectTypeOf(mutation.data).toMatchTypeOf<number[]>();

    return <></>;
  }

  render(
    <App>
      <MyComponent />
    </App>,
  );
  await waitFor(() => {
    expect(states.at(-1)?.data).toEqual([1, 2, 3]);
  });
  expect(mutateAsyncValues).toEqual([1, 2, 3]);
  expect(states).toEqual([
    { data: [], isPending: true, status: 'pending' },
    { data: [1], isPending: true, status: 'pending' },
    { data: [1, 2], isPending: true, status: 'pending' },
    { data: [1, 2, 3], isPending: false, status: 'success' },
  ]);
});
