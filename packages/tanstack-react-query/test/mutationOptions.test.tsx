import { getServerAndReactClient } from './__helpers';
import { useMutation } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react';
import { initTRPC } from '@trpc/server';
import { createDeferred } from '@trpc/server/unstable-core-do-not-import';
import * as React from 'react';
import { describe, expect, expectTypeOf, test } from 'vitest';
import { z } from 'zod';

const testContext = () => {
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

  return Object.assign(getServerAndReactClient(appRouter), { nextIterable });
};

describe('mutationOptions', () => {
  test('useMutation', async () => {
    await using ctx = testContext();
    const { useTRPC } = ctx;

    const calls: string[] = [];

    function MyComponent() {
      const trpc = useTRPC();

      const options = trpc.post.create.mutationOptions({
        onMutate(variables) {
          expectTypeOf<{ text: string }>(variables);
          calls.push('onMutate');
        },
        onSettled(data) {
          expectTypeOf<'__mutationResult' | undefined>(data);
          calls.push('onSettled');
        },
        onError(_error) {
          calls.push('onError');
        },
        onSuccess(data) {
          expectTypeOf<'__mutationResult'>(data);
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

    const utils = ctx.renderApp(<MyComponent />);
    await waitFor(() => {
      expect(utils.container).toHaveTextContent(`__mutationResult`);
    });

    expect(calls).toEqual(['onMutate', 'onSuccess', 'onSettled']);
  });
});
