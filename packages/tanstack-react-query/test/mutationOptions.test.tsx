import { getServerAndReactClient } from './__helpers';
import { useMutation } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { initTRPC } from '@trpc/server';
import { createDeferred } from '@trpc/server/unstable-core-do-not-import';
import { konn } from 'konn';
import * as React from 'react';
import { describe, expect, expectTypeOf, test } from 'vitest';
import { z } from 'zod';

const ctx = konn()
  .beforeEach(() => {
    let iterableDeferred = createDeferred<void>();
    const nextIterable = () => {
      iterableDeferred.resolve();
      iterableDeferred = createDeferred();
    };
    const t = initTRPC.create({});

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
    });

    const testHelpers = getServerAndReactClient(appRouter);

    return {
      ...testHelpers,
      nextIterable,
    };
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

describe('mutationOptions', () => {
  test('useMutation', async () => {
    const { App, useTRPC } = ctx;

    const calls: string[] = [];

    function MyComponent() {
      const trpc = useTRPC();

      const options = trpc.post.create.mutationOptions({
        onMutate(variables) {
          calls.push('onMutate');
        },
        onSettled(variables) {
          calls.push('onSettled');
        },
        onError(variables) {
          calls.push('onError');
        },
        onSuccess(variables) {
          calls.push('onSuccess');
        },
      });
      expect(options.trpc.path).toBe('post.create');

      const mutation = useMutation(options);

      React.useEffect(() => {
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

    expect(calls).toEqual(['onMutate', 'onSuccess', 'onSettled']);
  });
});
