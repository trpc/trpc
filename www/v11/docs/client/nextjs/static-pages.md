---
id: static-pages
title: Static pages and metadata
sidebar_label: Static pages and metadata
description: Share data between generateMetadata and the page, and prerender or revalidate (ISR) App Router pages with a context that reads no request data
slug: /client/nextjs/static-pages
section: "Client Usage"
parent: "client/nextjs/app-router-setup"
order: 70
---

This page builds on the [App Router setup](/docs/client/nextjs/app-router-setup).

```twoslash include static-pages
// @jsx: react-jsx
// @target: esnext
// @module: esnext
// @paths: {"~/*": ["./src/*"]}
// @filename: trpc/routers/_app.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
const t = initTRPC.create();
export const appRouter = t.router({
  hello: t.procedure
    .input(z.object({ text: z.string() }))
    .query(({ input }) => ({ greeting: `hello ${input.text}` })),
});
export type AppRouter = typeof appRouter;

// @filename: trpc/query-client.ts
import { QueryClient } from '@tanstack/react-query';
export function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { staleTime: 30 * 1000 } } });
}

// @filename: trpc/client.tsx
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from './routers/_app';
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

// @filename: trpc/server.tsx
import {
  createTRPCOptionsProxy,
  unstable_createHydrateClient,
} from '@trpc/tanstack-react-query';
import { cache } from 'react';
import { makeQueryClient } from './query-client';
import { appRouter } from './routers/_app';
export const getQueryClient = cache(makeQueryClient);
export const trpc = createTRPCOptionsProxy({
  ctx: {},
  router: appRouter,
  queryClient: getQueryClient,
});
export const trpcStatic = createTRPCOptionsProxy({
  ctx: {},
  router: appRouter,
  queryClient: getQueryClient,
});
export const HydrateClient = unstable_createHydrateClient(getQueryClient);
```

## Data for `generateMetadata` {#generate-metadata}

`generateMetadata` and the page render in the same request, so `getQueryClient()` returns the same query client in both. Fetch in `generateMetadata`, and the page's prefetch of the same query reuses the data instead of calling the procedure again:

```tsx twoslash title='app/page.tsx'
// @include: static-pages
// @filename: app/client-greeting.tsx
export function ClientGreeting() {
  return <div>Hello</div>;
}

// @filename: app/page.tsx
// ---cut---
import { noop } from '@tanstack/react-query';
import { getQueryClient, HydrateClient, trpc } from '~/trpc/server';
import { ClientGreeting } from './client-greeting';

export async function generateMetadata() {
  const greeting = await getQueryClient().query(
    trpc.hello.queryOptions({ text: 'world' }),
  );
  return { title: greeting.greeting };
}

export default async function Home() {
  // Fresh within `staleTime`, so this reuses what `generateMetadata` fetched
  await getQueryClient().query(trpc.hello.queryOptions({ text: 'world' })).catch(noop);

  return (
    <HydrateClient>
      <ClientGreeting />
    </HydrateClient>
  );
}
```

## Static and ISR pages {#static-pages}

The context in [`trpc/server.tsx`](/docs/client/nextjs/app-router-setup#6-create-a-trpc-caller-for-server-components) reads `headers()`, so a page that loads data through `trpc` renders on every request, whatever its `revalidate` or `generateStaticParams`. Next.js finds out during the build: `headers()` throws an error with a `digest` that tells Next.js to render the page on demand.

To prerender a page and revalidate it (ISR), load its data with a second proxy whose context reads no request data:

```ts twoslash title='trpc/server.tsx'
// @filename: init.ts
export const createTRPCContext = async (opts: { headers: Headers }) => {
  return { userId: 'user_123' };
};

// @filename: query-client.ts
import { QueryClient } from '@tanstack/react-query';
export function makeQueryClient() { return new QueryClient(); }

// @filename: routers/_app.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});

// @filename: server.tsx
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { cache } from 'react';
import { createTRPCContext } from './init';
import { makeQueryClient } from './query-client';
import { appRouter } from './routers/_app';
export const getQueryClient = cache(makeQueryClient);
// ---cut---
// For static and ISR pages: a context without the request's headers
export const trpcStatic = createTRPCOptionsProxy({
  ctx: () => createTRPCContext({ headers: new Headers() }),
  router: appRouter,
  queryClient: getQueryClient,
});
```

```tsx twoslash title='app/greeting/[text]/page.tsx'
// @include: static-pages
// @filename: app/greeting/[text]/client-greeting.tsx
export function ClientGreeting(props: { text: string }) {
  return <div>Hello</div>;
}

// @filename: app/greeting/[text]/page.tsx
// ---cut---
import { getQueryClient, HydrateClient, trpcStatic } from '~/trpc/server';
import { ClientGreeting } from './client-greeting';

// Render the page again at most once a minute
export const revalidate = 60;

// Prerender these at build time; others render on their first visit
export function generateStaticParams() {
  return [{ text: 'world' }];
}

export default async function Page(props: { params: Promise<{ text: string }> }) {
  const { text } = await props.params;
  // No `.catch(noop)`, so this throws if the procedure fails: the build fails,
  // and a failed revalidation keeps serving the last good page
  await getQueryClient().query(trpcStatic.hello.queryOptions({ text }));

  return (
    <HydrateClient>
      <ClientGreeting text={text} />
    </HydrateClient>
  );
}
```

```tsx twoslash title='app/greeting/[text]/client-greeting.tsx'
// @include: static-pages
// @filename: app/greeting/[text]/client-greeting.tsx
// ---cut---
'use client';

import { useSuspenseQuery } from '@tanstack/react-query';
import { useTRPC } from '~/trpc/client';

export function ClientGreeting(props: { text: string }) {
  const trpc = useTRPC();
  const greetingQuery = useSuspenseQuery(trpc.hello.queryOptions({ text: props.text }));
  return <div>{greetingQuery.data.greeting}</div>;
}
```

- Procedures get a context built without the request's headers, so anything your context reads from them, such as the signed-in user, is missing. Only public data belongs on these pages.
- Don't use `trpc` and `trpcStatic` on the same page: they share the query client and the query keys.
- The route's layouts must not read request data either.
- `generateStaticParams` runs at build time, outside any request. If it reads its params from a procedure, use `trpcStatic` there too.
