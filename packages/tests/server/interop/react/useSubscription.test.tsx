import { createQueryClient } from '../../__queryClient';
import { Post, createLegacyAppRouter } from './__testHelpers';
import { QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom';
import { render, waitFor } from '@testing-library/react';
import React, { useEffect, useState } from 'react';

let factory: ReturnType<typeof createLegacyAppRouter>;
beforeEach(() => {
  factory = createLegacyAppRouter();
});
afterEach(() => {
  factory.close();
});

describe('useSubscription', () => {
  test('mutation on mount + subscribe for it', async () => {
    const { trpc, client } = factory;
    function MyComponent() {
      const [posts, setPosts] = useState<Post[]>([]);

      const addPosts = (newPosts?: Post[]) => {
        setPosts((nowPosts) => {
          const map: Record<Post['id'], Post> = {};
          for (const msg of nowPosts ?? []) {
            map[msg.id] = msg;
          }
          for (const msg of newPosts ?? []) {
            map[msg.id] = msg;
          }
          return Object.values(map);
        });
      };
      const input = posts.reduce(
        (num, post) => Math.max(num, post.createdAt),
        -1,
      );

      trpc.useSubscription(['newPosts', input], {
        onData(post) {
          addPosts([post]);
        },
      });

      const mutation = trpc.useMutation('addPost');
      const mutate = mutation.mutate;
      useEffect(() => {
        if (posts.length === 2) {
          mutate({ title: 'third post' });
        }
      }, [posts.length, mutate]);

      return <pre>{JSON.stringify(posts, null, 4)}</pre>;
    }
    function App() {
      const [queryClient] = useState(() => createQueryClient());
      return (
        <trpc.Provider {...{ queryClient, client }}>
          <QueryClientProvider client={queryClient}>
            <MyComponent />
          </QueryClientProvider>
        </trpc.Provider>
      );
    }

    const utils = render(<App />);
    await waitFor(() => {
      expect(utils.container).toHaveTextContent('first post');
    });
    await waitFor(() => {
      expect(utils.container).toHaveTextContent('third post');
    });
  });
});
