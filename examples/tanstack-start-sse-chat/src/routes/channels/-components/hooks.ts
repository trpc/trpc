import {
  useMutation,
  useQueryClient,
  useSuspenseInfiniteQuery,
} from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { fromHandle } from '@trpc/tanstack-react-query/unstable-handles';
import type { inferInfiniteQueryHandle } from '@trpc/tanstack-react-query/unstable-handles';
import * as React from 'react';
import { useTRPC, type TRPC } from '~/lib/trpc';
import type { PostType } from '~/server/db/schema';

/**
 * Set isTyping with a throttle of 1s
 * Triggers immediately if state changes
 */
export function useThrottledIsTypingMutation(channelId: string) {
  const trpc = useTRPC();
  const { mutate } = useMutation(trpc.channel.isTyping.mutationOptions());

  return React.useMemo(() => {
    let state = false;
    let timeout: ReturnType<typeof setTimeout> | null;
    function trigger() {
      timeout && clearTimeout(timeout);
      timeout = null;

      mutate({ typing: state, channelId });
    }

    return (nextState: boolean) => {
      const shouldTriggerImmediately = nextState !== state;

      state = nextState;
      if (shouldTriggerImmediately) {
        trigger();
      } else {
        timeout ??= setTimeout(trigger, 1000);
      }
    };
  }, [mutate, channelId]);
}

/**
 * Subscribes to new posts in every channel, so switching channels doesn't
 * resubscribe. Collects them by channel id, including channels that haven't
 * been opened yet.
 */
export function useLivePosts() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [postsByChannel, setPostsByChannel] = React.useState<
    Record<string, PostType[]>
  >({});

  // Once a post has arrived, `httpSubscriptionLink` resumes from its id when it reconnects
  const canResume = React.useRef(false);

  const subscription = useSubscription(
    trpc.post.onAdd.subscriptionOptions(
      {},
      {
        async onStarted() {
          if (canResume.current) {
            return;
          }
          // The stream only has posts from now on, so refetch the channels loaded before it.
          // A load that's still running may have read the database before the stream
          // started, and invalidating would reuse it, so wait for it first.
          const queryKey = trpc.post.infinite.pathKey();
          const running = queryClient
            .getQueryCache()
            .findAll({ queryKey, fetchStatus: 'fetching' })
            .flatMap((query) => query.promise ?? []);
          await Promise.allSettled(running);
          await queryClient.invalidateQueries({ queryKey });
        },
        onData(event) {
          canResume.current = true;
          const post = event.data;
          setPostsByChannel((current) => ({
            ...current,
            [post.channelId]: [...(current[post.channelId] ?? []), post],
          }));
        },
        onError(err) {
          console.error('Subscription error:', err);
          // "Try again" starts a new stream, without the last event id
          canResume.current = false;
        },
      },
    ),
  );

  return { postsByChannel, subscription };
}

/**
 * A channel's fetched posts, with the ones that arrived live added
 */
export function useChannelPosts(
  posts: inferInfiniteQueryHandle<TRPC['post']['infinite']>,
  livePosts: PostType[] | undefined,
) {
  const trpc = useTRPC();
  const query = useSuspenseInfiniteQuery(
    fromHandle(trpc, posts, {
      getNextPageParam: (d) => d.nextCursor,
      // No need to refetch as we have a subscription
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    }),
  );

  const messages = React.useMemo(() => {
    // A live post can also be in a page fetched after it arrived, so dedupe by id
    const byId = new Map<string, PostType>();
    for (const page of query.data.pages) {
      for (const post of page.items) {
        byId.set(post.id, post);
      }
    }
    for (const post of livePosts ?? []) {
      byId.set(post.id, post);
    }
    return [...byId.values()].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
  }, [query.data.pages, livePosts]);

  return { query, messages };
}
