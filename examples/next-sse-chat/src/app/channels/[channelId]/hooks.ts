import { skipToken } from '@tanstack/react-query';
import { trpc } from '~/lib/trpc';
import * as React from 'react';

/**
 * Set isTyping with a throttle of 1s
 * Triggers immediately if state changes
 */
export function useThrottledIsTypingMutation(channelId: string) {
  const isTyping = trpc.channel.isTyping.useMutation();

  return React.useMemo(() => {
    let state = false;
    let timeout: ReturnType<typeof setTimeout> | null;
    function trigger() {
      timeout && clearTimeout(timeout);
      timeout = null;

      isTyping.mutate({ typing: state, channelId });
    }

    return (nextState: boolean) => {
      const shouldTriggerImmediately = nextState !== state;

      state = nextState;
      if (shouldTriggerImmediately) {
        trigger();
      } else if (!timeout) {
        timeout = setTimeout(trigger, 1000);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);
}

export function useLivePosts(channelId: string) {
  const [, query] = trpc.post.infinite.useSuspenseInfiniteQuery(
    { channelId },
    {
      getNextPageParam: (d) => d.nextCursor,
      // No need to refetch as we have a subscription
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    },
  );
  const utils = trpc.useUtils();
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
  const subscription = trpc.post.onAdd.useSubscription(
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
  );
  return {
    query,
    messages,
    subscription,
  };
}
