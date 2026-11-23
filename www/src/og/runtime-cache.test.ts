import { describe, expect, it } from 'vitest';

import { fetchAvatars } from './avatar.ts';
import { cachedInstance, mapCache, png, serveAvatars } from './fake-avatars.ts';
import type { RuntimeCacheStore } from './runtime-cache.ts';

describe('layerBackingRuntimeCache', () => {
  it("keeps an avatar under the store's id and tag, for the cache's own expiry in whole seconds", async () => {
    await using server = await serveAvatars({ '/a.png': png() });
    const { kept, store } = mapCache();
    await using runtime = cachedInstance(store, {
      persisted: () => '30.9 seconds',
    });
    await runtime.runPromise(fetchAvatars([server.url('/a.png')]));
    const entries = [...kept.entries()];
    expect(entries).toHaveLength(1);
    const [[key, entry]] = entries as [[string, (typeof entries)[0][1]]];
    expect(key.startsWith('og-avatar\n')).toBe(true);
    expect(entry.tags).toEqual(['og-avatar']);
    expect(entry.ttl).toBe(30);
  });

  it('keeps nothing with less than a second to live, which the cache may take as no expiry', async () => {
    await using server = await serveAvatars({ '/a.png': png() });
    const { kept, store } = mapCache();
    await using runtime = cachedInstance(store, {
      persisted: () => '500 millis',
    });
    await runtime.runPromise(fetchAvatars([server.url('/a.png')]));
    expect(kept.size).toBe(0);
  });

  it("fetches an avatar the cache keeps something else for, fails for or doesn't answer in time", async () => {
    await using server = await serveAvatars({ '/a.png': png() });
    const never = () => new Promise<never>(() => {});
    const fails = async () => {
      throw new Error('unreachable');
    };
    const stores: Array<RuntimeCacheStore> = [
      { ...mapCache().store, get: async () => 'not an avatar' },
      {
        ...mapCache().store,
        get: async () => ({ _tag: 'Success', value: '' }),
      },
      { delete: fails, expireTag: fails, get: fails, set: fails },
      { delete: never, expireTag: never, get: never, set: never },
    ];
    for (const store of stores) {
      await using runtime = cachedInstance(store);
      expect(
        (await runtime.runPromise(fetchAvatars([server.url('/a.png')]))).size,
      ).toBe(1);
    }
    expect(server.hits).toEqual(['/a.png', '/a.png', '/a.png', '/a.png']);
  });
});
