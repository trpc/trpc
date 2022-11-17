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
├── prisma  # <-- if prisma is added
│   └── [..]
├── src
│   ├── pages
│   │   ├── _app.tsx  # <-- add `withTRPC()`-HOC here
│   │   ├── api
│   │   │   └── trpc
│   │   │       └── [trpc].ts  # <-- tRPC HTTP handler
│   │   └── [..]
│   ├── server
│   │   ├── routers
│   │   │   ├── _app.ts  # <-- main app router
│   │   │   ├── post.ts  # <-- sub routers
│   │   │   └── [..]
│   │   ├── context.ts   # <-- create app context
│   │   └── trpc.ts      # <-- procedure helpers
│   └── utils
│       └── trpc.ts  # <-- your typesafe tRPC hooks
└── [..]
```

## Add tRPC to existing Next.js project

### 1. Install deps

**npm**

```bash
npm install @trpc/server @trpc/client @trpc/react-query @trpc/next @tanstack/react-query zod
```

**yarn**

```bash
yarn add @trpc/server @trpc/client @trpc/react-query @trpc/next @tanstack/react-query zod
```

**pnpm**

```bash
pnpm add @trpc/server @trpc/client @trpc/react-query @trpc/next @tanstack/react-query zod
```

#### Why @tanstack/react-query?

`@trpc/react-query` provides a thin wrapper over [@tanstack/react-query](https://tanstack.com/query/v4/docs/adapters/react-query). It is required as a peer dependency.

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

Initialize your tRPC backend using the `initTRPC` function and create your first router.

:::note
The below showcased backend uses the [recommended file structure](#recommended-file-structure), but you can keep it simple and put everything in the [api-handler directly](https://github.com/trpc/trpc/blob/next/examples/next-minimal-starter/src/pages/api/trpc/%5Btrpc%5D.ts) if you want.
:::

<details><summary>View sample backend</summary>

```ts title='server/trpc.ts'
import { TRPCError, initTRPC } from '@trpc/server';

// Avoid exporting the entire t-object since it's not very
// descriptive and can be confusing to newcomers used to t
// meaning translation in i18n libraries.
const t = initTRPC.create();

// Base router and procedure helpers
export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Reusable middleware that checks if users are authenticated.
 * @note Example only, yours may vary depending on how your auth is setup
 **/
const isAuthed = t.middleware(({ next, ctx }) => {
  if (!ctx.session?.user?.email) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
    });
  }
  return next({
    ctx: {
      // Infers the `session` as non-nullable
      session: ctx.session,
    },
  });
});

// Protected procedures for logged in users only
export const protectedProcedure = t.procedure.use(isAuthed);
```

<br/>

```ts title='server/routers/_app.ts'
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

export const appRouter = router({
  hello: publicProcedure
    .input(
      z.object({
        text: z.string().nullish(),
      }),
    )
    .query(({ input }) => {
      return {
        greeting: `hello ${input?.text ?? 'world'}`,
      };
    }),
});

// export type definition of API
export type AppRouter = typeof appRouter;
```

<br/>

:::note
If you need to split your router into several subrouters, you can implement them in the `server/routers` directory and import and [merge them](../server/merging-routers.md) to a single root `appRouter`. Check out the [next-prisma-starter](https://github.com/trpc/trpc/tree/next/examples/next-prisma-starter/src/server/routers) for an example of this usage.
:::

<br/>

```ts title='pages/api/trpc/[trpc].ts'
import * as trpcNext from '@trpc/server/adapters/next';
import { appRouter } from '../../../server/routers/_app';

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
import type { AppRouter } from '../server/routers/_app';

function getBaseUrl() {
  if (typeof window !== 'undefined')
    // browser should use relative path
    return '';

  if (process.env.VERCEL_URL)
    // reference for vercel.com
    return `https://${process.env.VERCEL_URL}`;

  if (process.env.RENDER_INTERNAL_HOSTNAME)
    // reference for render.com
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
       * @link https://tanstack.com/query/v4/docs/reference/QueryClient
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

:::info
createTRPCNext does not work with interop mode. If you are migrating from v9 using interop, keep using [the old way of initializing tRPC](../../versioned_docs/version-9.x/nextjs/introduction.md#4-create-trpc-hooks).
:::

### 5. Configure `_app.tsx`

```tsx title='pages/_app.tsx'
import type { AppType } from 'next/app';
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

- **Required**:
  - `links` to customize the flow of data between tRPC Client and the tRPC Server. [Read more](links).
- Optional:
  - `queryClientConfig`: a configuration object for the React Query `QueryClient` used internally by the tRPC React hooks: [QueryClient docs](https://tanstack.com/query/v4/docs/reference/QueryClient)
  - `queryClient`: a React Query [QueryClient instance](https://tanstack.com/query/v4/docs/reference/QueryClient)
    - **Note:**: You can only provide either a `queryClient` or a `queryClientConfig`.
  - `transformer`: a transformer applied to outgoing payloads. Read more about [Data Transformers](data-transformers)
  - `abortOnUnmount`: determines if in-flight requests will be cancelled on component unmount. This defaults to `false`.

### `unstable_overrides`: (default: `undefined`)

Configure [overrides for React Query's hooks](../reactjs/useContext.mdx#invalidate-full-cache-on-every-mutation).

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

Refer to the `@trpc/react-query` docs for additional information on executing [Queries](react-queries) and [Mutations](react-mutations) inside your components.
