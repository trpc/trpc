import {
  skipToken,
  useMutation,
  useSuspenseInfiniteQuery,
} from '@tanstack/react-query';
import {
  useSubscription,
  type unstable_inferInfiniteQueryHandle,
} from '@trpc/tanstack-react-query';
import * as React from 'react';
import { useTRPC, type TRPC } from '~/lib/trpc';

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

export function useLivePosts(
  posts: unstable_inferInfiniteQueryHandle<TRPC['post']['infinite']>,
) {
  const channelId = posts.input.channelId;
  const trpc = useTRPC();
  const query = useSuspenseInfiniteQuery(
    trpc.unstable_$fromHandle(posts, {
      getNextPageParam: (d) => d.nextCursor,
      // No need to refetch as we have a subscription
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    }),
  );
  const [messages, setMessages] = React.useState(() => {
    const msgs = query.data?.pages.map((page) => page.items).flat();
    return msgs ?? null;
  });
  type Post = NonNullable<typeof messages>[number];

  /**
   * fn to add and dedupe new messages onto state
   */
  const addMessages = React.useCallback((incoming?: Post[]) => {
    setMessages((current) => {
      const map: Record<Post['id'], Post> = {};
      for (const msg of current ?? []) {
        map[msg.id] = msg;
      }
      for (const msg of incoming ?? []) {
        map[msg.id] = msg;
      }
      return Object.values(map).sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      );
    });
  }, []);

  /**
   * when new data from `useInfiniteQuery`, merge with current state
   */
  React.useEffect(() => {
    const msgs = query.data?.pages.map((page) => page.items).flat();
    addMessages(msgs);
  }, [query.data?.pages, addMessages]);

  const [lastEventId, setLastEventId] = React.useState<
    // Query has not been run yet
    | false
    // Empty list
    | null
    // Event id
    | string
  >(false);
  if (messages && lastEventId === false) {
    // We should only set the lastEventId once, if the SSE-connection is lost, it will automatically reconnect and continue from the last event id
    // Changing this value will trigger a new subscription
    setLastEventId(messages.at(-1)?.id ?? null);
  }
  const subscription = useSubscription(
    trpc.post.onAdd.subscriptionOptions(
      lastEventId === false ? skipToken : { channelId, lastEventId },
      {
        onData(event) {
          addMessages([event.data]);
        },
        onError(err) {
          console.error('Subscription error:', err);

          const lastMessageEventId = messages?.at(-1)?.id;
          if (lastMessageEventId) {
            // We've lost the connection, let's resubscribe from the last message
            setLastEventId(lastMessageEventId);
          }
        },
      },
    ),
  );
  return {
    query,
    messages,
    subscription,
  };
}
