import { cacheTags, revalidationTag } from '@trpcdev/tanstack-query';
import { expect, test } from 'vite-plus/test';
import { createApp, db } from './fixtures/app.ts';

/** Next's data cache, reduced to tags: `cached` keeps a result until one of its tags is revalidated. */
function tagCache() {
  const entries = new Map<string, { tags: string[]; value: unknown }>();
  return {
    async cached<T>(id: string, tags: string[], run: () => Promise<T>) {
      const hit = entries.get(id);
      if (hit) return hit.value as T;
      const value = await run();
      entries.set(id, { tags, value });
      return value;
    },
    revalidateTag(tag: string) {
      for (const [id, entry] of entries) {
        if (entry.tags.includes(tag)) entries.delete(id);
      }
    },
  };
}

test('cacheTags go from the root to the path and input', async () => {
  await using app = await createApp();
  expect(
    cacheTags(app.trpc.post.byId.queryKey({ input: { id: '1' } })),
  ).toEqual([
    'trpc',
    'trpc:post',
    'trpc:post.byId',
    'trpc:post.byId:{"id":"1"}',
  ]);
  expect(
    cacheTags(app.trpc.post.list.queryKey({ input: { limit: 2, cursor: 0 } })),
  ).toEqual(
    cacheTags(app.trpc.post.list.queryKey({ input: { cursor: 0, limit: 2 } })),
  );
  expect(cacheTags(app.trpc.post.pathKey())).toEqual(['trpc', 'trpc:post']);
  expect(revalidationTag(app.trpc.post.pathKey())).toBe('trpc:post');
  expect(revalidationTag(app.trpc.pathKey())).toBe('trpc');
  expect(revalidationTag(app.trpc.post.byId.pathKey())).toBe('trpc:post.byId');

  const long = { id: 'x'.repeat(300) };
  expect(cacheTags(app.trpc.post.byId.queryKey({ input: long }))).toEqual([
    'trpc',
    'trpc:post',
    'trpc:post.byId',
  ]);
  expect(revalidationTag(app.trpc.post.byId.queryKey({ input: long }))).toBe(
    'trpc:post.byId',
  );
});

test('revalidating a key drops the cached calls it covers', async () => {
  await using app = await createApp();
  const cache = tagCache();
  const getPost = (id: string) => {
    const key = app.trpc.post.byId.queryKey({ input: { id } });
    return cache.cached(revalidationTag(key), cacheTags(key), () =>
      app.client.post.byId.query({ id }),
    );
  };

  await getPost('1');
  await getPost('2');
  await getPost('1');
  expect(db.calls).toEqual(['post.byId:1', 'post.byId:2']);

  cache.revalidateTag(
    revalidationTag(app.trpc.post.byId.queryKey({ input: { id: '1' } })),
  );
  await getPost('1');
  await getPost('2');
  expect(db.calls).toEqual(['post.byId:1', 'post.byId:2', 'post.byId:1']);

  cache.revalidateTag(revalidationTag(app.trpc.post.pathKey()));
  await getPost('2');
  expect(db.calls.at(-1)).toBe('post.byId:2');
  expect(db.calls).toHaveLength(4);
});
