import { getServerAndReactClient } from './__reactHelpers';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { onlineManager } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createTRPCQueryUtils } from '@trpc/react-query';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';
import React from 'react';

type Post = {
  id: number;
};

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create();

    const posts: Post[] = [];

    const appRouter = t.router({
      post: t.router({
        create: t.procedure.mutation(() => {
          const newPost: Post = { id: posts.length };
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
  test('mutation paused due to no network connection should resume when the connection is restored', async () => {
    const { client, App, queryClient, opts } = ctx;
    const trpcQueryUtils = createTRPCQueryUtils({
      client: opts.client,
      queryClient,
    });

    // This is very important
    // https://tanstack.com/query/latest/docs/framework/react/guides/mutations#persisting-offline-mutations
    trpcQueryUtils.post.create.setMutationDefaults({});

    function MyComponent() {
      const createPostMutation = client.post.create.useMutation();

      return (
        <>
          <button
            data-testid="add-post"
            onClick={() => {
              createPostMutation.mutate();
            }}
          />
          <button
            data-testid="online-toggle"
            onClick={() => {
              onlineManager.setOnline(!onlineManager.isOnline());
            }}
          />
          <span data-testid="status">{createPostMutation.status}</span>
          <span data-testid="is-paused">
            {createPostMutation.isPaused ? 1 : 0}
          </span>
        </>
      );
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );

    const addPostButton = await utils.findByTestId('add-post');
    const onlineToggleButton = await utils.findByTestId('online-toggle');
    const statusSpan = await utils.findByTestId('status');
    const isPausedSpan = await utils.findByTestId('is-paused');

    await userEvent.click(onlineToggleButton);
    await userEvent.click(addPostButton);
    await waitFor(() => {
      expect(statusSpan).toHaveTextContent('pending');
      expect(isPausedSpan).toHaveTextContent('1');
    });
    await userEvent.click(onlineToggleButton);
    await waitFor(() => {
      expect(statusSpan).toHaveTextContent('success');
      expect(isPausedSpan).toHaveTextContent('0');
    });
  });
});
