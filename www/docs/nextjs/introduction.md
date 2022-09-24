---
id: introduction
title: Usage with Next.js
sidebar_label: Usage with Next.js
slug: /nextjs
---

:::tip
If you're using tRPC in a new project, consider using one of the example projects as a starting point or for reference: [tRPC Example Projects](example-apps)
:::

tRPC and Next.js are a match made in heaven! Next.js makes it easy for you to build your client and server together in one codebase. This makes it easy to share types between them.

tRPC includes dedicated tools to make the Next.js developer experience as seamless as possible.

## Recommended file structure

Recommended but not enforced file structure. This is what you get when starting from [the examples](../main/example-apps.md).

```graphql
.
├── prisma # <-- if prisma is added
│   └── [..]
├── src
│   ├── pages
│   │   ├── _app.tsx # <-- add `withTRPC()`-HOC here
│   │   ├── api
│   │   │   └── trpc
│   │   │       └── [trpc].ts # <-- tRPC HTTP handler
│   │   └── [..]
│   ├── server
│   │   ├── routers
│   │   │   ├── app.ts   # <-- main app router
│   │   │   ├── post.ts  # <-- sub routers
│   │   │   └── [..]
│   │   ├── context.ts      # <-- create app context
│   │   └── trpc.ts         # <-- procedure helpers
│   └── utils
│       └── trpc.ts  # <-- your typesafe tRPC hooks
└── [..]
```

## Add tRPC to existing Next.js project

### 1. Install deps

**npm**

```bash
npm install @trpc/server@next @trpc/client@next @trpc/react@next @trpc/next@next @tanstack/react-query
```

**yarn**

```bash
yarn add @trpc/server@next @trpc/client@next @trpc/react@next @trpc/next@next @tanstack/react-query
```

**pnpm**

```bash
pnpm add @trpc/server@next @trpc/client@next @trpc/react@next @trpc/next@next @tanstack/react-query
```

#### Why @tanstack/react-query?
`@trpc/react` provides a thin wrapper over [@tanstack/react-query](https://tanstack.com/query/v4/docs/adapters/react-query). It is required as a peer dependency.

#### Why Zod?
Most examples use [Zod](https://github.com/colinhacks/zod) for input validation and we highly recommended it, though it isn't required. You can use a validation library of your choice ([Yup](https://github.com/jquense/yup), [Superstruct](https://github.com/ianstormtaylor/superstruct), [io-ts](https://github.com/gcanti/io-ts), etc). In fact, any object containing a `parse`, `create` or `validateSync` method will work.

### 2. Enable strict mode

If you want to use Zod for input validation, make sure you have enabled strict mode in your `tsconfig.json`:

```diff title="tsconfig.json"
  "compilerOptions": {
+   "strict": true
  }
```

If strict mode is too much, at least enable `strictNullChecks`:

```diff title="tsconfig.json"
  "compilerOptions": {
+   "strictNullChecks": true
  }
```

### 3. Create a tRPC router

Implement your tRPC router in `./pages/api/trpc/[trpc].ts`. If you need to split your router into several subrouters, implement them in a top-level `server` directory in your project root, then import them into `./pages/api/trpc/[trpc].ts` and [merge them](merging-routers) into a single root `appRouter`.

<details><summary>View sample router</summary>

```ts title='./pages/api/trpc/[trpc].ts'
import { initTRPC } from '@trpc/server';
import * as trpcNext from '@trpc/server/adapters/next';
import { z } from 'zod';

export const t = initTRPC.create();

export const appRouter = t.router({
  hello: t.procedure
    .input(
      z
        .object({
          text: z.string().nullish(),
        })
        .nullish(),
    )
    .query(({ input }) => {
      return {
        greeting: `hello ${input?.text ?? 'world'}`,
      };
    }),
});

// export type definition of API
export type AppRouter = typeof appRouter;

// export API handler
export default trpcNext.createNextApiHandler({
  router: appRouter,
  createContext: () => ({}),
});
```

</details>

### 4. Create tRPC hooks

Create a set of strongly-typed hooks using your API's type signature.

```tsx title='utils/trpc.ts'
import { httpBatchLink } from '@trpc/client';
import { createTRPCNext } from '@trpc/next';
import type { AppRouter } from '../pages/api/trpc/[trpc]';

function getBaseUrl() {
  if (typeof window !== 'undefined') // browser should use relative path
    return '';

  if (process.env.VERCEL_URL) // reference for vercel.com
    return `https://${process.env.VERCEL_URL}`;

  if (process.env.RENDER_INTERNAL_HOSTNAME) // reference for render.com
    return `http://${process.env.RENDER_INTERNAL_HOSTNAME}:${process.env.PORT}`;

  // assume localhost
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export const trpc = createTRPCNext<AppRouter>({
  config({ ctx }) {
    return {
      links: [
        httpBatchLink({
          /**
           * If you want to use SSR, you need to use the server's full URL
           * @link https://trpc.io/docs/ssr
           **/
          url: `${getBaseUrl()}/api/trpc`,
        }),
      ],
      /**
       * @link https://react-query-v3.tanstack.com/reference/QueryClient
       **/
      // queryClientConfig: { defaultOptions: { queries: { staleTime: 60 } } },
    };
  },
  /**
   * @link https://trpc.io/docs/ssr
   **/
  ssr: true,
});
// => { useQuery: ..., useMutation: ...}
```

### 5. Configure `_app.tsx`

```tsx title='pages/_app.tsx'
import type { AppType } from 'next/dist/shared/lib/utils';
import { trpc } from '../utils/trpc';

const MyApp: AppType = ({ Component, pageProps }) => {
  return <Component {...pageProps} />;
};

export default trpc.withTRPC(MyApp);
```

### 6. Make API requests

```tsx title='pages/index.tsx'
import { trpc } from '../utils/trpc';

export default function IndexPage() {
  const hello = trpc.hello.useQuery({ text: 'client' });
  if (!hello.data) {
    return <div>Loading...</div>;
  }
  return (
    <div>
      <p>{hello.data.greeting}</p>
    </div>
  );
}
```

## `createTRPCNext()` options

### `config`-callback

The `config`-argument is a function that returns an object that configures the tRPC and React Query clients. This function has a `ctx` input that gives you access to the Next.js `req` object, among other things. The returned value can contain the following properties:

- Exactly **one of** these are **required**:

  - `url` your API URL.
  - `links` to customize the flow of data between tRPC Client and the tRPC-server. [Read more](../client/links.md).

- Optional:
  - `queryClientConfig`: a configuration object for the React Query `QueryClient` used internally by the tRPC React hooks: [QueryClient docs](https://tanstack.com/query/v4/docs/reference/QueryClient)
  - `headers`: an object or a function that returns an object of outgoing tRPC requests
  - `transformer`: a transformer applied to outgoing payloads. Read more about [Data Transformers](data-transformers)
  - `fetch`: customize the implementation of `fetch` used by tRPC internally
  - `AbortController`: customize the implementation of `AbortController` used by tRPC internally
  - `abortOnUnmount`: determines if in-flight requests will be cancelled on component unmount. This defaults to `false`.

### `ssr`-boolean (default: `false`)

Whether tRPC should await queries when server-side rendering a page. Defaults to `false`.

### `responseMeta`-callback

Ability to set request headers and HTTP status when server-side rendering.

#### Example

```tsx title='utils/trpc.ts'
import { createTRPCNext } from '@trpc/next';
import type { AppRouter } from '../pages/api/trpc/[trpc]';

export const trpc = createTRPCNext<AppRouter>({
  config({ ctx }) {
    /* [...] */
  },
  ssr: true,
  responseMeta({ clientErrors, ctx }) {
    if (clientErrors.length) {
      // propagate first http error from API calls
      return {
        status: clientErrors[0].data?.httpStatus ?? 500,
      };
    }
    // cache full page for 1 day + revalidate once every second
    const ONE_DAY_IN_SECONDS = 60 * 60 * 24;
    return {
      'Cache-Control': `s-maxage=1, stale-while-revalidate=${ONE_DAY_IN_SECONDS}`,
    };
  },
});
```

## Next steps

Refer to the `@trpc/react` docs for additional information on executing [Queries](react-queries) and [Mutations](react-mutations) inside your components.
