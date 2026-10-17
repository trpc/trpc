import { createCollection } from '@tanstack/db';
import { queryCollectionOptions } from '@tanstack/query-db-collection';
import { QueryClient } from '@tanstack/query-core';
import { expect, expectTypeOf, test, vi } from 'vite-plus/test';
import { createApp, db, type Post } from './fixtures/app.ts';

test('queryOptions plug into a TanStack DB query collection', async () => {
  await using app = await createApp({ posts: 2 });
  const queryClient = new QueryClient();
  const list = app.trpc.post.list.queryOptions({ input: { limit: 10 } });

  const posts = createCollection(
    queryCollectionOptions({
      queryKey: list.queryKey,
      queryFn: list.queryFn,
      select: (data) => data.items,
      queryClient,
      getKey: (post) => post.id,
      onInsert: async (opts) => {
        for (const { modified } of opts.transaction.mutations) {
          await app.client.post.create.mutate({ title: modified.title });
        }
      },
    }),
  );
  await posts.preload();

  expectTypeOf(posts.toArray).items.toExtend<Post>();
  expect(posts.toArray.map((p) => p.title)).toEqual(['Post 1', 'Post 2']);
  expect(posts.get('1')?.createdAt).toBeInstanceOf(Date);
  expect(queryClient.getQueryData(list.queryKey)?.items).toHaveLength(2);

  const tx = posts.insert({ id: '3', title: 'Post 3', createdAt: new Date() });
  expect(posts.get('3')?.title).toBe('Post 3');
  await tx.when('settled');
  expect(db.posts.get('3')?.title).toBe('Post 3');
  await vi.waitFor(() =>
    expect(queryClient.getQueryData(list.queryKey)?.items).toHaveLength(3),
  );

  app.addPost('From elsewhere');
  await queryClient.invalidateQueries({
    queryKey: app.trpc.post.list.pathKey(),
  });
  await vi.waitFor(() => expect(posts.get('4')?.title).toBe('From elsewhere'));

  await posts.cleanup();
});
