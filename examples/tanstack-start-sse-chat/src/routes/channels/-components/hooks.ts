import {
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import * as React from 'react';
import { useTRPC } from '~/lib/trpc';

/**
 * Waits for any loads of `queryKey` that are already running. One may have read
 * the database before a change we're about to apply, and would overwrite it.
 */
async function waitForRunningLoads(
  queryClient: QueryClient,
  queryKey: QueryKey,
) {
  const running = queryClient
    .getQueryCache()
    .findAll({ queryKey, fetchStatus: 'fetching' })
    .flatMap((query) => query.promise ?? []);
  await Promise.allSettled(running);
}

/**
 * Subscribes to new posts in every channel, so switching channels doesn't
 * resubscribe, and adds them to the channel's cached posts.
 */
export function useLivePosts() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  // Once a post has arrived, `httpSubscriptionLink` resumes from its id when it reconnects
  const canResume = React.useRef(false);

  return useSubscription(
    trpc.post.onAdd.subscriptionOptions(
      {},
      {
        onStarted() {
          if (canResume.current) {
            return;
          }
          // The server is listening now, but the stream only has posts from here on,
          // so refetch the channels loaded before it
          const queryKey = trpc.post.infinite.pathKey();
          void waitForRunningLoads(queryClient, queryKey).then(() =>
            queryClient.invalidateQueries({
              queryKey,
              // Including channels not on screen, or whose `Chat` is still suspended:
              // they don't refetch when they mount (`refetchOnMount: false` in `Chat`)
              refetchType: 'all',
            }),
          );
        },
        onData(event) {
          canResume.current = true;
          const post = event.data;
          const queryKey = trpc.post.infinite.infiniteQueryKey({
            channelId: post.channelId,
          });
          void waitForRunningLoads(queryClient, queryKey).then(() =>
            queryClient.setQueryData(queryKey, (data) => {
              // A channel that isn't loaded gets this post when it loads
              if (!data) return data;
              // A load or a resume can have sent it already
              const isLoaded = data.pages.some((page) =>
                page.items.some((item) => item.id === post.id),
              );
              if (isLoaded) return data;
              // `pages[0]` is the newest page. The post usually goes at its end,
              // but a replayed or late one can be older than posts already there.
              return {
                ...data,
                pages: data.pages.map((page, index) =>
                  index === 0
                    ? {
                        ...page,
                        items: [...page.items, post].toSorted(
                          (a, b) =>
                            a.createdAt.getTime() - b.createdAt.getTime(),
                        ),
                      }
                    : page,
                ),
              };
            }),
          );
        },
        onError(err) {
          console.error('Subscription error:', err);
          // "Try again" starts a new stream, without the last event id
          canResume.current = false;
        },
      },
    ),
  );
}
