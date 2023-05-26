'use client';

import { Suspense, SuspenseProps, useEffect } from 'react';
import { api } from '~/trpc/client';

function hydrateCache(
  obj: Record<
    string,
    {
      promise?: unknown;
    }
  >,
) {
  const cache: Record<string, {}> = {};

  for (const [key, value] of Object.entries(obj)) {
    // omit promise
    const { promise, ...rest } = value;
    cache[key] = {
      ...rest,
    };
  }
  return cache;
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

      <script
        className="___hydrate"
        dangerouslySetInnerHTML={{
          __html: `window.trpcCache = ${JSON.stringify(
            hydrateCache(api.cache),
          )};`,
        }}
      />
      {props.children}
    </Suspense>
  );
}
