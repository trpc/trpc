---
id: intro
title: Usage with Next.js
sidebar_label: Usage with Next.js
slug: /nextjs
---

:::tip
If you're using tRPC in a new project, consider using one of the example projects as a starting point: [tRPC Example Projects](/docs/example-apps)
:::

tRPC and Next.js are a match made in heaven! Next.js makes it easy for you to build your client and server together in one codebase. This makes it easy to share types between them.

tRPC includes dedicated tools to make the Next.js developer experience as seamless as possible.

<!-- 
## Recommended file structure

Recommended but not enforced file structure. This is what you get when starting from [the examples](../main/example-apps.md).

```txt
├── pages
│   ├── _app.tsx # <-- wrap App with `withTRPC()`
│   ├── api
│   │   └── trpc
│   │       └── [trpc].ts # <-- tRPC response handler
│   └── [...]
├── prisma # <-- if prisma is added
│   ├── migrations
│   │   └── [...]
│   └── schema.prisma
├── routers # <-- implement sub-routers here
│   ├── users.ts
│   ├── posts.ts
│   └── [...]
├── public
│   └── [...]
├── test  # <-- (optional) E2E-test helpers
│   └── playwright.test.ts
├── utils
│   └── trpc.ts # <-- create your typesafe tRPC hooks
└── [...]
``` -->


## Add tRPC to existing Next.js project


### 1. Install deps

```bash
yarn add @trpc/client @trpc/server @trpc/react @trpc/next zod react-query
```

- React Query: `@trpc/react` provides a thin wrapper over [react-query](https://react-query.tanstack.com/overview). It is required as a peer dependency.
- Zod: most examples use Zod for input validation, though it isn't required. You can use a validation library of your choice (Yup, io-ts, etc). In fact, any object containing a `parse` or `validateSync` method will work.

### 2. Create a tRPC router

Implement your tRPC router in `./pages/api/trpc/[trpc].ts`. If you need to split your router into several subrouters, implement them in a top-level `trpc` directory in your project root, then import them into `./pages/api/trpc/[trpc].ts` and [merge them](/docs/merging-routers) into a single root `appRouter`.

<details><summary>View sample router</summary>

```ts
import * as trpc from '@trpc/server';
import * as trpcNext from '@trpc/server/adapters/next';
import { z } from 'zod';

const appRouter = trpc.router().query('hello', {
  input: z
    .object({
      text: z.string().nullish(),
    })
    .nullish(),
  resolve({ input }) {
    return {
      greeting: `hello ${input?.text ?? 'world'}`,
    };
  },
});

// export type definition of API
export type AppRouter = typeof appRouter;

// export API handler
export default trpcNext.createNextApiHandler({
  router: appRouter,
  createContext: () => null,
});
```

</details>

### 3. Create tRPC hooks

Create a set of strongly-typed hooks using your API's type signature.

```tsx
// utils/trpc.ts
import { createReactQueryHooks } from '@trpc/react';
import type { AppRouter } from '../pages/api/trpc/[trpc]';

export const trpc = createReactQueryHooks<AppRouter>();
// => { useQuery: ..., useMutation: ...}
```

### 4. Configure `_app.tsx`

The `createReactQueryHooks` function expects certain parameters to be passed via the Context API. To set these parameters, create a custom `_app.tsx` using the `withTRPC` higher-order component:

```ts
import { withTRPC } from '@trpc/next';
import { AppType } from 'next/dist/next-server/lib/utils';

const MyApp: AppType = ({ Component, pageProps }) => {
  return <Component {...pageProps} />;
};

export default withTRPC({
  config(_ctx) {
    const url = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}/api/trpc`
      : 'http://localhost:3000/api/trpc';

    return {
      url,
      queryClientConfig: {
        defaultOptions: {
          queries: {
            staleTime: 600,
          },
        },
      },
    };
  },
  ssr: true,
})(MyApp);
```

### 5. Make API requests

```tsx
import { trpc } from '../utils/trpc';

const IndexPage = () => {
  const hello = trpc.useQuery(['hello', { text: 'client' }]);
  if (!hello.data) return <div>Loading...</div>;
  return (
    <div>
      <p>{hello.data.greeting}</p>
    </div>
  );
};

export default IndexPage;
```



## `withTRPC()` options

### `config`-callback

The `config`-argument is a function that returns an object that configures the tRPC and React Query clients. This function has a `ctx` input that gives you access to the Next.js `req` object, among other things. The returned value can contain the following properties:

- `url` REQUIRED: Your API URL.
- `queryClientConfig`: a configuration object for the React Query `QueryClient` used internally by the tRPC React hooks: [QueryClient docs](https://react-query.tanstack.com/reference/QueryClient)
- `getHeaders`: a function that returns a list of headers to be set on outgoing
  tRPC requests
- `transformer`: a transformer applied to outgoing payloads. Read more about [Data Transformers](/docs/data-transformers)
- `FetchOptions`: customize the implementation of `fetch` used by tRPC internally

### `ssr`-boolean (default: `false`)

Whether tRPC should await queries when server-side rendering a page. Defaults to `false`.


## Next steps

Refer to the `@trpc/react` docs for additional information on executing [Queries](/docs/react-queries) and [Mutations](/docs/react-mutations) inside your components.
