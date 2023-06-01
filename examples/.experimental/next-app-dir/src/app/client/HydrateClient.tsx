'use client';

import { api } from '~/trpc/client';
import { Suspense, SuspenseProps, use, useEffect } from 'react';

function hydrateCache(
  obj: Record<
    string,
    {
      promise?: unknown;
    }
  >,
) {
  const cache: Record<string, Record<string, unknown>> = {};

  for (const [key, value] of Object.entries(obj)) {
    // omit promise
    const { promise, ...rest } = value;
    cache[key] = {
      ...rest,
    };

    if (!Object.keys(rest).length) {
      throw new Error(`No data for ${key}`);
    }
  }
  console.log('[HYDRATING]', cache, obj);
  return cache;
}

function Hydratorz() {
  console.log('--- waiting for being settled');
  use(api.onSettled());
  console.log('api settled');

  return (
    <script
      className="___hydrate"
      dangerouslySetInnerHTML={{
        __html: `window.trpcCache = ${JSON.stringify(
          hydrateCache(api.cache),
        )};`,
      }}
    />
  );
}
export function HydrateClient(props: {
  fallback?: SuspenseProps['fallback'];
  children: React.ReactNode;
}) {
  // Start spy listening to any queries

  useEffect(() => {
    console.log('widnow cache', window.trpcCache);
  }, []);
  //
  return (
    <Suspense {...props}>
      {/* Stop listening to spy */}
      {props.children}
      <Hydratorz />
    </Suspense>
  );
}
