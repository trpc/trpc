import { useQueryClient } from '@tanstack/react-query';
import { trpc } from './suspenseDestructuring.trpc';

export function Component() {
  const channelId = '1';

  const [data, query] = trpc.post.list.useSuspenseQuery();

  const [a, b] = [1, 2];

  const [, query2] = trpc.post.infinite.useSuspenseInfiniteQuery(
    { channelId },
    {
      getNextPageParam: (d) => d.nextCursor,
      // No need to refetch as we have a subscription
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    },
  );

  const [data3, query3] = trpc.post.infinite.useSuspenseInfiniteQuery(
    { channelId },
    {
      getNextPageParam: (d) => d.nextCursor,
    },
  );

  const [data4] = trpc.post.infinite.useSuspenseInfiniteQuery(
    { channelId },
    {
      getNextPageParam: (d) => d.nextCursor,
    },
  );

  return useQueryClient().isFetching() ? 'loading' : 'loaded';
}
