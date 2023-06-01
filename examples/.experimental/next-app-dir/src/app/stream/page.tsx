'use client';

import { Suspense, use } from 'react';
import { createDataStream } from './lib/UseClientHydrationStreamProvider';

interface Shape {
  key: string;
  data: unknown;
}

const stream = createDataStream<Shape>();

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));

  return `waited ${ms}ms` as const;
}

function isBrowser() {
  return typeof window !== 'undefined';
}

const clientCache: Record<string, Shape> = {};

function MyComponent(props: { wait: number }) {
  const cacheKey = JSON.stringify(props);

  const ctx = use(stream.context);
  // This should be lib code:
  let data: Awaited<ReturnType<typeof wait>>;

  if (isBrowser() && clientCache[cacheKey]) {
    console.log('browser read from cache!!!!!!!!', { cacheKey });
    data = clientCache[cacheKey].data as Awaited<ReturnType<typeof wait>>;
  } else {
    console.error('no cache :(');
    data = use(wait(props.wait));
  }

  ctx.stream.push({ key: cacheKey, data });

  return <div>{data}</div>;
}
export default function DefaultPage() {
  return (
    <stream.Provider
      onEntries={(entries) => {
        console.log('received entries', entries, entries.length);
        for (const entry of entries) {
          if (clientCache[entry.key]) {
            console.log(`${entry.key} already in cache`);
            continue;
          }
          clientCache[entry.key] = entry;
        }
      }}
    >
      <Suspense fallback={<div>waiting for 3 entries...</div>}>
        <MyComponent wait={100} />
        <MyComponent wait={100} />
        <MyComponent wait={100} />
      </Suspense>
      <Suspense fallback={<div>waiting for 1 entry....</div>}>
        <MyComponent wait={1000} />
      </Suspense>
      <Suspense fallback={<div>waiting for 2 entries....</div>}>
        <MyComponent wait={2000} />
        <MyComponent wait={3000} />
        <MyComponent wait={3000} />
      </Suspense>
    </stream.Provider>
  );
}
