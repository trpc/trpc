import {
  useMutation,
  useQueryClient,
  useSuspenseInfiniteQuery,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { fromHandle } from '@trpc/tanstack-react-query/unstable-handles';
import type { inferInfiniteQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import * as React from 'react';
import { useTRPC, type TRPC } from '~/lib/trpc';

/**
 * Set isTyping with a throttle of 1s
 * Triggers immediately if state changes
 */
export function useThrottledIsTypingMutation(channelId: string) {
  const trpc = useTRPC();
  const { mutate } = useMutation(trpc.channel.isTyping.mutationOptions());
  const typing = React.useRef(false);
  const timeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  function send() {
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = null;
    mutate({ typing: typing.current, channelId });
  }

  return (nextTyping: boolean) => {
    const changed = nextTyping !== typing.current;
    typing.current = nextTyping;
    if (changed) {
      send();
      return;
    }
    // Unchanged: send it again at most once a second
    if (timeout.current) return;
    timeout.current = setTimeout(send, 1000);
  };
}

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
        async onStarted() {
          if (canResume.current) {
            return;
          }
          // The server is listening now, but the stream only has posts from here on,
          // so refetch the channels loaded before it
          const queryKey = trpc.post.infinite.pathKey();
          await waitForRunningLoads(queryClient, queryKey);
          await queryClient.invalidateQueries({
            queryKey,
            // Including channels not on screen, or whose `Chat` is still suspended:
            // they don't refetch when they mount (`refetchOnMount: false` below)
            refetchType: 'all',
          });
        },
        async onData(event) {
          canResume.current = true;
          const post = event.data;
          const queryKey = trpc.post.infinite.infiniteQueryKey({
            channelId: post.channelId,
          });
          await waitForRunningLoads(queryClient, queryKey);
          queryClient.setQueryData(queryKey, (data) => {
            // A channel that isn't loaded gets this post when it loads
            if (!data) return data;
            // A load or a resume can have sent it already
            const isLoaded = data.pages.some((page) =>
              page.items.some((item) => item.id === post.id),
            );
            if (isLoaded) return data;
            // `pages[0]` is the newest page, so add the post to its end
            return {
              ...data,
              pages: data.pages.map((page, index) =>
                index === 0 ? { ...page, items: [...page.items, post] } : page,
              ),
            };
          });
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

/**
 * A channel's posts. `useLivePosts()` adds new ones to the cache.
 */
export function useChannelPosts(
  posts: inferInfiniteQueryHandle<TRPC['post']['infinite']>,
) {
  const trpc = useTRPC();
  return useSuspenseInfiniteQuery(
    fromHandle(trpc, posts, {
      getNextPageParam: (d) => d.nextCursor,
      // No need to refetch as we have a subscription
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    }),
  );
}
