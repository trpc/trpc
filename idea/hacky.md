```tsx
"use client";
import React, { useState } from "react";
import { useServerInsertedHTML } from "next/navigation";
import { StyleRegistry, createStyleRegistry } from "styled-jsx";

interface CacheEntry {
  status: "error" | "success";
  data?: unknown;
  error?: unknown;
}

const cacheProvider = createContext();

function MyComponent() {
  const context = use(cacheProvider);

  const result = trpc.foo.query();
  context.cache[cacheKey] = result;
}

/**
 *
 * Server:
 * 1. `useServerInsertedHTML()` is called **on the server** whenever a `Suspense`-boundary completes
 *    - This means that we might have some new entries in the cache that needs to be flushed
 *    - We pass these to the client by inserting a `<script>`-tag where we do `window._trpcCache[id].push(serializedVersionOfCache)`
 *
 * Client:
 * 2. In `useEffect()`:
 *   - We check if `window._trpcCache[id]` is set to an array and call `push()` on all the entries
 *   -
 **/
export default function TRPCHydrationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // unique id for the cache provider
  const id = useId();
  const [cache, setCache] = useState(() => ({} as Record<string, CacheEntry>));

  // Server: flush cache
  useServerInsertedHTML(() => {
    const serializedCache = JSON.stringify(transformer.serialize(cache));

    // TODO: dedupe so we reset what we send to the client

    // Calling:
    // window._trpcCache[id].push()
    return (
      <script
        dangerouslyInsertBlabla={{
          __html: `
            window._trpcCache = window._trpcCache || {};
            window._trpcCache["${id}"] = window._trpcCache["${id}"] || [];
            window._trpcCache["${id}"].push(${serializedCache});
        `.trim(),
        }}
      />
    );
  });

  // Client: consume cache:
  const push = useCallback((serializedCacheEntryRecord: unknown) => {
    const cacheEntryRecord: Record<string, CacheEntry> =
      transformer.deserialize(JSON.parse(serializedCacheEntryRecord));
    for (const [key, entry] of Object.entries(cacheEntryRecord)) {
      if (cache[key]) {
        // Client already has a cached key
        continue;
      }
      cache[key] = entry;

      if (!queryClient.has(key)) {
        queryClient.setData(key, entry);
      }
    }
  }, []);

  useEffect(() => {
    // Register cache consumer
    window._trpcCache = window._trpcCache || {};
    window._trpcCache[id] = window._trpcCache[id] || [];
    const windowCache: Array<Record<string, CacheEntry>> | CacheConsumer =
      window._trpcCache[id];

    if (Array.isArray(window._trpcCache)) {
      window._trpcCache.map(push);
      // Following calls to `window._trpcCache.push()` will go straight to `push`
      window._trpcCache[id] = {
        push,
      };
      return;
    }
    throw new Error(`${id} seem to have been registered twice`);
  }, []);

  return <TRPCCacheProvider cache={cache}>{children}</TRPCCacheProvider>;
}
```
