import { createQueryClient } from '../__queryClient';
import { createAppRouter } from './__testHelpers';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useState } from 'react';

let factory: ReturnType<typeof createAppRouter>;
beforeEach(() => {
  factory = createAppRouter();
});
afterEach(async () => {
  await factory.close();
});

describe('setQueriesData()', () => {
  test('overrides initial data', async () => {
    const { trpc, client, App } = factory;
    function MyComponent() {
      const utils = trpc.useUtils();

      const allPostsQuery = trpc.allPosts.useQuery(undefined, {
        enabled: false,
      });

      return (
        <>
          <pre>{JSON.stringify(allPostsQuery.data ?? null, null, 4)}</pre>
          <button
            data-testid="setQueriesData"
            onClick={async () => {
              const updatedKeys = utils.allPosts.setQueriesData(
                undefined,
                {},
                [
                  {
                    id: 'id2',
                    title: 'allPost.newTitle1',
                    createdAt: Date.now(),
                  },
                  {
                    id: 'id2',
                    title: 'allPost.newTitle2',
                    createdAt: Date.now(),
                  },
                ],
                undefined,
              );

              expect(updatedKeys.length).toBeGreaterThan(0);
            }}
          />
        </>
      );
    }

    const utils = render(
      <App>
        <MyComponent />
      </App>,
    );

    expect(utils.container).not.toHaveTextContent('allPost.newTitle1');
    expect(utils.container).not.toHaveTextContent('allPost.newTitle2');

    await userEvent.click(utils.getByTestId('setQueriesData'));

    await waitFor(() => {
      expect(utils.container).toHaveTextContent('allPost.newTitle1');
      expect(utils.container).toHaveTextContent('allPost.newTitle2');
    });
  });
});
