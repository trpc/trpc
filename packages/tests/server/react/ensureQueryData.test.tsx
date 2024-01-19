import { createQueryClient } from '../__queryClient';
import { createAppRouter } from './__testHelpers';
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { getUntypedClient } from '@trpc/client';
import React, { useEffect, useState } from 'react';

let factory: ReturnType<typeof createAppRouter>;
beforeEach(() => {
  factory = createAppRouter();
});
afterEach(async () => {
  await factory.close();
});

describe('ensureQueryData()', () => {
  test('with input', async () => {
    const { trpc, App } = factory;
    function MyComponent() {
      const [state, setState] = useState<string>('nope');
      const utils = trpc.useUtils();
      const queryClient = useQueryClient();

      useEffect(() => {
        async function prefetch() {
          const initialQuery = await utils.postById.ensureData('1');
          expect(initialQuery.title).toBe('first post');

          const cachedQuery = await utils.postById.ensureData('1');
          expect(cachedQuery.title).toBe('first post');

          // Update data to invalidate the cache
          utils.postById.setData('1', () => {
            return {
              id: 'id',
              title: 'updated post',
              createdAt: Date.now(),
            };
          });

          const updatedQuery = await utils.postById.ensureData('1');
          expect(updatedQuery.title).toBe('updated post');

          setState(updatedQuery.title);
        }
        prefetch();
      }, [queryClient, utils]);

      return <>{JSON.stringify(state)}</>;
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );
    await waitFor(() => {
      expect(utils.container).toHaveTextContent('updated post');
    });

    // Because we are using `ensureData` here, it should always be only a single call
    // as the first invocation will fetch and cache the data, and any consecutive calls
    // will not go through `postById.fetch`, but rather get the data directly from cache.
    //
    // Calling `postById.setData` updates the cache as well, so even after update
    // number of direct calls should still be 1.
    expect(factory.resolvers.postById.mock.calls.length).toBe(1);
    expect(factory.resolvers.postById.mock.calls[0]![0]).toBe('1');
  });
});
