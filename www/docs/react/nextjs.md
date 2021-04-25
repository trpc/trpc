---
id: nextjs
title: Getting Started with Next.js
sidebar_label: Getting Started with Next.js
slug: /nextjs
---

## tRPC + Next.js File Structure

Recommended but not enforced file structure. This is what you get when starting from the examples.

```txt
├── pages
│   ├── _app.tsx # <-- wrap App with `withTRPCClient()`
│   ├── api
│   │   └── trpc
│   │       ├── [trpc].ts # <-- tRPC response handler
│   │       └── [...] # <-- potential sub-routers
│   └── [...]
├── prisma # <-- (optional) if prisma is added
│   ├── migrations
│   │   └── [...] 
│   └── schema.prisma
├── public
│   └── [...]
├── test  # <-- (optional) E2E-test helpers
│   └── playwright.test.ts
├── utils
│   └── trpc.ts # <-- create your typesafe tRPC hooks
└── [...]
```

## 🌟 Start from scratch


Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) to bootstrap one of the examples:


### TodoMVC with [Prisma](https://www.prisma.io/)


> TodoMVC-app implemented with tRPC. Uses [superjson](https://github.com/blitz-js/superjson) to transparently use `Date`s over the wire.
> 
> Live demo at [todomvc.trpc.io](https://todomvc.trpc.io)


```bash
npx create-next-app --example https://github.com/trpc/trpc --example-path examples/next-prisma-todomvc trpc-todo
```

### Simple Starter without database

> Simple starter project with a mock in-memory db.
> 
> Live demo at [hello-world.trpc.io](https://hello-world.trpc.io) _(note that data isn't persisted on Vercel as it's running in lambda functions)_

```bash
npx create-next-app --example https://github.com/trpc/trpc --example-path examples/next-hello-world my-app
```

### Real-time chat with [Prisma](https://www.prisma.io/)

> Using experimental subscription support.
> 
> Live demo at [chat.trpc.io](https://chat.trpc.io)

```bash
npx create-next-app --example https://github.com/trpc/trpc --example-path examples/next-ssg-chat my-chat-app
```

## 🐻 Add to existing project

The code here is taken from [`./examples/next-hello-world`](https://github.com/trpc/trpc/tree/main/examples/next-hello-world).


### 0. Install deps


```bash
yarn add @trpc/client @trpc/server @trpc/react zod react-query
```

- tRPC wraps a tiny layer of sugar around [react-query](https://react-query.tanstack.com/overview) when using React which gives you type safety and auto completion of your procedures
- Zod is a great validation lib that works well, but tRPC also works out-of-the-box with yup/myzod/[..] - [see test suite](https://github.com/trpc/trpc/blob/main/packages/server/test/validators.test.ts)


### 1. Create an API handler

Create a file at `./pages/api/trpc/[trpc].ts`

Paste the following code:

```ts
import * as trpc from '@trpc/server';
import * as trpcNext from '@trpc/server/adapters/next';
import * as z from 'zod';

// The app's context - is generated for each incoming request
export type Context = {};
const createContext = ({
  req,
  res,
}: trpcNext.CreateNextContextOptions): Context => {
  return {};
};

function createRouter() {
  return trpc.router<Context>();
}
// Important: only use this export with SSR/SSG
export const appRouter = createRouter()
  // Create procedure at path 'hello'
  .query('hello', {
    // using zod schema to validate and infer input values
    input: z
      .object({
        text: z.string().optional(),
      })
      .optional(),
    resolve({ input }) {
      // the `input` here is parsed by the parser passed in `input` the type inferred
      return {
        greeting: `hello ${input?.text ?? 'world'}`,
      };
    },
  });

// Exporting type _type_ AppRouter only exposes types that can be used for inference
// https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export
export type AppRouter = typeof appRouter;

// export API handler
export default trpcNext.createNextApiHandler({
  router: appRouter,
  createContext,
});

```

### Option A) Using Server-side rendering


#### 2. Create tRPC-hooks


Create `./utils/trpc.ts`

```tsx
import { createReactQueryHooks } from '@trpc/react';
// Type-only import:
// https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export
import type { AppRouter } from '../pages/api/trpc/[trpc]';

export const trpc = createReactQueryHooks<AppRouter>();
```

#### 3. Configure `_app.tsx`


```tsx
import { withTRPCClient } from '@trpc/next';
import { AppType } from 'next/dist/next-server/lib/utils';
import React from 'react';
import type { AppRouter } from './api/trpc/[trpc]';

const MyApp: AppType = ({ Component, pageProps }) => {
  return <Component {...pageProps} />;
};

export default withTRPCClient<AppRouter>(
  ({ ctx }) => {
    if (process.browser) {
      return {
        url: '/api/trpc',
      };
    }
    // optional: use SSG-caching for each rendered page (see caching section for more details)
    const ONE_DAY_SECONDS = 60 * 60 * 24;
    ctx?.res?.setHeader(
      'Cache-Control',
      `s-maxage=1, stale-while-revalidate=${ONE_DAY_SECONDS}`,
    );

    // The server needs to know your app's full url
    // On render.com you can use `http://${process.env.RENDER_INTERNAL_HOSTNAME}:${process.env.PORT}/api/trpc`
    const url = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}/api/trpc`
      : 'http://localhost:3000/api/trpc';

    return {
      url,
      getHeaders() {
        return {
          'x-ssr': '1',
        };
      },
    };
  },
  { ssr: true },
)(MyApp);
```

#### 4. Start consuming your data!


```tsx
import Head from 'next/head';
import { trpc } from '../utils/trpc';

export default function Home() {
  // try typing here to see that you get autocompletion & type safety on the procedure's name
  const helloNoArgs = trpc.useQuery(['hello']);
  const helloWithArgs = trpc.useQuery(['hello', { text: 'client' }]);

  return (
    <div>
      <Head>
        <title>Hello tRPC</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <h1>Hello World Example</h1>
      <ul>
        <li>
          helloNoArgs ({helloNoArgs.status}):{' '}
          <pre>{JSON.stringify(helloNoArgs.data, null, 2)}</pre>
        </li>
        <li>
          helloWithArgs ({helloWithArgs.status}):{' '}
          <pre>{JSON.stringify(helloWithArgs.data, null, 2)}</pre>
        </li>
      </ul>
    </div>
  );
}
```


