import { getServerAndReactClient } from './__reactHelpers';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { onlineManager } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createTRPCQueryUtils } from '@trpc/react-query';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';
import React from 'react';
import { z } from 'zod';

type Post = {
  id: number;
  title: string;
};

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create();

    const posts: Post[] = [];

    const appRouter = t.router({
      post: t.router({
        create: t.procedure
          .input(z.object({ title: z.string() }))
          .mutation(({ input }) => {
            const newPost: Post = { id: posts.length, title: input.title };
            posts.push(newPost);
            return newPost;
          }),
      }),
    });

    const persister = createSyncStoragePersister({
      storage: window.localStorage,
    });

    return getServerAndReactClient(appRouter, { persister });
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

describe('offline', () => {
  test('mutation paused due to no network connection should be persisted and resume automatically', async () => {
    const { client, App, queryClient, opts } = ctx;
    const trpcQueryUtils = createTRPCQueryUtils({
      client: opts.client,
      queryClient,
    });

    const onMutationSuccess = vi.fn();

    // This is very important
    // https://tanstack.com/query/latest/docs/framework/react/guides/mutations#persisting-offline-mutations
    trpcQueryUtils.post.create.setMutationDefaults(
      ({ canonicalMutationFn }) => ({
        mutationFn: canonicalMutationFn,
        onSuccess: (data, variables) => {
          onMutationSuccess(data, variables);
        },
      }),
    );

    async function simulateMutationWithoutConnection() {
      function MyComponent() {
        const createPostMutation = client.post.create.useMutation();
        return (
          <>
            <button
              data-testid="mutate"
              onClick={() => {
                onlineManager.setOnline(false);
                createPostMutation.mutate({ title: 'foo' });
              }}
            />
            <span data-testid="status">{createPostMutation.status}</span>
            <span data-testid="is-paused">
              {createPostMutation.isPaused ? '1' : '0'}
            </span>
          </>
        );
      }

      const utils = render(
        <App>
          <MyComponent />
        </App>,
      );

      const mutateBtn = await utils.findByTestId('mutate');
      const statusSpan = await utils.findByTestId('status');
      const isPausedSpan = await utils.findByTestId('is-paused');
      await userEvent.click(mutateBtn);
      await waitFor(() => {
        expect(statusSpan).toHaveTextContent('pending');
        expect(isPausedSpan).toHaveTextContent('1');
      });
    }

    async function restoreConnectionAndVerifyMutation() {
      // Note: this is a different render without the useMutation hook
      // This simulates closing and reopening the app.
      const utils = render(
        <App>
          <button
            data-testid="restore-connection"
            onClick={() => onlineManager.setOnline(true)}
          >
            restore connection
          </button>
        </App>,
      );
      const restoreConnectionButton =
        await utils.findByTestId('restore-connection');
      expect(onMutationSuccess.mock.calls).toHaveLength(0);
      await userEvent.click(restoreConnectionButton);
      await waitFor(() => {
        expect(onMutationSuccess.mock.calls).toHaveLength(1);
        expect(onMutationSuccess.mock.calls[0]).toEqual([
          {
            id: 0,
            title: 'foo',
          },
          { title: 'foo' },
        ]);
      });
    }

    await simulateMutationWithoutConnection();
    await restoreConnectionAndVerifyMutation();
  });
});
