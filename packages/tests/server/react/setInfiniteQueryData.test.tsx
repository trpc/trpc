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

describe('setInfiniteQueryData()', () => {
  test('with & without callback', async () => {
    const { trpc, client, App } = factory;
    function MyComponent() {
      const utils = trpc.useUtils();
      const allPostsQuery = trpc.paginatedPosts.useInfiniteQuery(
        {},
        {
          enabled: false,
          getNextPageParam: (next) => next.nextCursor,
        },
      );
      return (
        <>
          <pre>
            {JSON.stringify(
              allPostsQuery.data?.pages.map((p) => p.items) ?? null,
              null,
              4,
            )}
          </pre>
          <button
            data-testid="setInfiniteQueryData"
            onClick={async () => {
              // Add a new post to the first page (without callback)
              utils.paginatedPosts.setInfiniteData(
                {},
                {
                  pages: [
                    {
                      items: [
                        {
                          id: 'id',
                          title: 'infinitePosts.title1',
                          createdAt: Date.now(),
                        },
                      ],
                      nextCursor: null,
                    },
                  ],
                  pageParams: [],
                },
              );

              const newPost = {
                id: 'id',
                title: 'infinitePosts.title2',
                createdAt: Date.now(),
              };

              // Add a new post to the first page (with callback)
              utils.paginatedPosts.setInfiniteData({}, (data) => {
                expect(data).not.toBe(undefined);

                if (!data) {
                  return {
                    pages: [],
                    pageParams: [],
                  };
                }

                return {
                  ...data,
                  pages: data.pages.map((page) => {
                    return {
                      ...page,
                      items: [...page.items, newPost],
                    };
                  }),
                };
              });
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

    await userEvent.click(utils.getByTestId('setInfiniteQueryData'));

    await waitFor(() => {
      expect(utils.container).toHaveTextContent('infinitePosts.title1');
      expect(utils.container).toHaveTextContent('infinitePosts.title2');
    });
  });
});
