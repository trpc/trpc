import { testReactResource } from './__helpers';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react';
import { initTRPC } from '@trpc/server';
import * as React from 'react';
import { describe, expect, expectTypeOf, test } from 'vitest';
import { z } from 'zod';

const testContext = () => {
  const t = initTRPC.create({});

  const posts = ['initial'];

  const appRouter = t.router({
    post: t.router({
      list: t.procedure.query(() => {
        return posts;
      }),
      create: t.procedure
        .input(
          z.object({
            text: z.string(),
          }),
        )
        .mutation(({ input }) => {
          posts.push(input.text);
          return '__mutationResult' as const;
        }),
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

  return testReactResource(appRouter);
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

  test('optimistic update', async () => {
    await using ctx = testContext();
    const { useTRPC } = ctx;

    const calls: string[] = [];

    function MyComponent() {
      const trpc = useTRPC();
      const queryClient = useQueryClient();

      const query = useQuery(trpc.post.list.queryOptions());

      const mutation = useMutation(
        trpc.post.create.mutationOptions({
          async onMutate(variables) {
            calls.push('onMutate');
            const queryKey = trpc.post.list.queryKey();
            await queryClient.cancelQueries({ queryKey });

            const previousData = queryClient.getQueryData(queryKey);
            queryClient.setQueryData(queryKey, (old) => [
              ...(old ?? []),
              variables.text,
            ]);

            return { previousData };
          },
          onError(_err, _variables, context) {
            calls.push('onError');
            queryClient.setQueryData(
              trpc.post.list.queryKey(),
              context?.previousData,
            );
          },
          onSettled() {
            calls.push('onSettled');
            queryClient.invalidateQueries(trpc.post.list.queryFilter());
          },
        }),
      );

      React.useEffect(() => {
        mutation.mutate({
          text: 'optimistic',
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      return <pre>{JSON.stringify(query.data)}</pre>;
    }

    const utils = ctx.renderApp(<MyComponent />);

    await waitFor(() => {
      expect(utils.container).toHaveTextContent(
        JSON.stringify(['initial', 'optimistic']),
      );
    });
    expect(calls).toEqual(['onMutate', 'onSettled']);
  });
});
