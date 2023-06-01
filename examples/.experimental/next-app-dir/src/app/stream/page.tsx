'use client';

import { Suspense, use } from 'react';
import {
  UseClientHydrationStreamProvider,
  getHydrationStreamContext,
} from './lib/UseClientHydrationStreamProvider';

interface Shape {
  key: string;
  data: unknown;
}
const HydrationStreamProvider = UseClientHydrationStreamProvider<Shape>;
const context = getHydrationStreamContext<Shape>();

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));

  return `waited ${ms}ms` as const;
}
function MyComponent(props: { wait: number }) {
  const ctx = use(context);
  const data = use(wait(props.wait));
  ctx.stream.push({ key: `${props.wait}`, data });

  return <div>{data}</div>;
}
export default function DefaultPage() {
  return (
    <HydrationStreamProvider
      onEntries={(entries) => {
        console.log('received entries', entries, entries.length);
      }}
    >
      <Suspense fallback={<div>waiting for 3</div>}>
        <MyComponent wait={100} />
        <MyComponent wait={100} />
        <MyComponent wait={100} />
      </Suspense>
      <Suspense fallback={<div>waiting for 1</div>}>
        <MyComponent wait={1000} />
      </Suspense>
      <Suspense fallback={<div>waiting for 2</div>}>
        <MyComponent wait={2000} />
        <MyComponent wait={3000} />
      </Suspense>
    </HydrationStreamProvider>
  );
}
