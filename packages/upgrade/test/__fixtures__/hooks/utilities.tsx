import { trpc } from './utilities.trpc';

export function Component() {
  const utils = trpc.useUtils();

  utils.post.list.cancel();
  utils.post.byId.cancel({ id: 1 });

  utils.post.list.ensureData();
  utils.post.byId.ensureData({ id: 1 });

  utils.post.list.getData();
  utils.post.paginate.getInfiniteData();
  utils.post.byId.getData({ id: 1 });

  utils.post.list.fetch();
  utils.post.paginate.fetchInfinite({ cursor: 1 });
  utils.post.byId.fetch({ id: 1 });

  utils.post.list.prefetch();
  utils.post.paginate.prefetchInfinite({ cursor: 1 });
  utils.post.byId.prefetch({ id: 1 });

  utils.post.list.refetch();
  utils.post.byId.refetch({ id: 1 });

  utils.post.list.reset();
  utils.post.byId.reset({ id: 1 });

  utils.post.list.invalidate();
  utils.post.byId.invalidate({ id: 1 });

  utils.post.list.setData(undefined, []);
  utils.post.list.setData(undefined, (old) => [
    ...(old ?? []),
    { id: 2, title: 'new' },
  ]);

  utils.post.byId.setData({ id: 1 }, { id: 1, title: 'new' });
  utils.post.byId.setData({ id: 1 }, (old) => {
    if (!old) return { id: 1, title: 'new' };
    return { ...old, title: 'new' };
  });

  utils.post.paginate.setInfiniteData(
    { cursor: 1 },
    {
      pageParams: [1],
      pages: [{ items: [{ id: 1, title: 'setInfiniteData1' }], nextCursor: 2 }],
    },
  );

  utils.post.paginate.setInfiniteData({ cursor: 1 }, (prev) => {
    return {
      pageParams: [...(prev?.pageParams ?? []), 2],
      pages: [
        ...(prev?.pages ?? []),
        { items: [{ id: 1, title: 'setInfiniteData1' }], nextCursor: 2 },
      ],
    };
  });

  return 'ok';
}
