import { useQueryClient } from '@tanstack/react-query';
import { useTRPC } from './utilities.trpc';

export function Component() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  queryClient.cancelQueries(trpc.post.list.pathFilter());
  queryClient.cancelQueries(trpc.post.byId.queryFilter({ id: 1 }));

  queryClient.ensureQueryData(trpc.post.list.queryOptions());
  queryClient.ensureQueryData(trpc.post.byId.queryOptions({ id: 1 }));

  queryClient.getQueryData(trpc.post.list.queryKey());
  queryClient.getQueryData(trpc.post.paginate.infiniteQueryKey());
  queryClient.getQueryData(trpc.post.byId.queryKey({ id: 1 }));

  queryClient.fetchQuery(trpc.post.list.queryOptions());
  queryClient.fetchInfiniteQuery(
    trpc.post.paginate.infiniteQueryOptions({ cursor: 1 }),
  );
  queryClient.fetchQuery(trpc.post.byId.queryOptions({ id: 1 }));

  queryClient.prefetchQuery(trpc.post.list.queryOptions());
  queryClient.prefetchInfiniteQuery(
    trpc.post.paginate.infiniteQueryOptions({ cursor: 1 }),
  );
  queryClient.prefetchQuery(trpc.post.byId.queryOptions({ id: 1 }));

  queryClient.refetchQueries(trpc.post.list.pathFilter());
  queryClient.refetchQueries(trpc.post.byId.queryFilter({ id: 1 }));

  queryClient.resetQueries(trpc.post.list.pathFilter());
  queryClient.resetQueries(trpc.post.byId.queryFilter({ id: 1 }));

  queryClient.invalidateQueries(trpc.post.list.pathFilter());
  queryClient.invalidateQueries(trpc.post.byId.queryFilter({ id: 1 }));

  queryClient.setQueryData(trpc.post.list.queryKey(), []);
  queryClient.setQueryData(trpc.post.list.queryKey(), (old) => [
    ...(old ?? []),
    { id: 2, title: 'new' },
  ]);

  queryClient.setQueryData(trpc.post.byId.queryKey({ id: 1 }), {
    id: 1,
    title: 'new',
  });
  queryClient.setQueryData(trpc.post.byId.queryKey({ id: 1 }), (old) => {
    if (!old) return { id: 1, title: 'new' };
    return { ...old, title: 'new' };
  });

  queryClient.setQueryData(trpc.post.paginate.infiniteQueryKey({ cursor: 1 }), {
    pageParams: [1],
    pages: [{ items: [{ id: 1, title: 'setInfiniteData1' }], nextCursor: 2 }],
  });

  queryClient.setQueryData(
    trpc.post.paginate.infiniteQueryKey({ cursor: 1 }),
    (prev) => {
      return {
        pageParams: [...(prev?.pageParams ?? []), 2],
        pages: [
          ...(prev?.pages ?? []),
          { items: [{ id: 1, title: 'setInfiniteData1' }], nextCursor: 2 },
        ],
      };
    },
  );

  return 'ok';
}
