import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import type { TRPC } from '~/lib/trpc';
import { getSession } from '~/server/auth';

const fetchSession = createServerFn().handler(() => getSession(getRequest()));

export function sessionQuery() {
  return queryOptions({
    queryKey: ['session'],
    queryFn: () => fetchSession(),
    // Signing in or out reloads the page
    staleTime: Infinity,
  });
}

export function channelListQuery(trpc: TRPC) {
  return trpc.channel.list.queryOptions();
}

export function postListQuery(trpc: TRPC, input: { channelId: string }) {
  return trpc.post.infinite.infiniteQueryOptions(input, {
    getNextPageParam: (d) => d.nextCursor,
    // No need to refetch as we have a subscription
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}
