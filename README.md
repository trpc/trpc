<div align="center">
  <h1 align="center">tRPC</h1>
  <p>a toolkit for building end-to-end TypeScript data layers</p>
  <p><img src="https://storage.googleapis.com/trpc/trpcgif.gif" alt="Server/client example"></p>
</div>

- [Motivation](#motivation)
- [Usage](#usage)
  - [Example apps](#example-apps)
  - [Getting started with Next.js](#getting-started-with-nextjs)
  - [Defining routes](#defining-routes)
  - [Merging routes](#merging-routes)
  - [Data transformers](#data-transformers)
  - [Server-side rendering (SSR / SSG)](#server-side-rendering-ssr--ssg)
- [Further reading](#further-reading)
  - [HTTP Methods ↔️ endpoint type mapping](#http-methods-️-endpoint-type-mapping)
  - [Relationship to GraphQL](#relationship-to-graphql)
  - [Alternative projects](#alternative-projects)
- [Development](#development)
  - [Development workflow](#development-workflow)
- [Contributors ✨](#contributors-)
# Motivation

tRPC is a framework for building strongly typed RPC APIs with TypeScript. Alternatively, you can think of it as a way to avoid APIs altogether.

- 🔐  Type-safety on everything - on the API-routes, the input data & router output.
- 🐎  No run-time bloat or slow code generation. The magic is all in the TypeScript compiler. tRPC itself has no deps and a tiny client-side footprint.
- 😌  No double-declaration of types. Actually you don't have to declare types at all, as they are inferred.
- 🔋  Batteries included with a React-library but not tRPC is in no way tied to React (wanna make one for Svelte or Vue? [Contact us](https://twitter.com/trpcio))
- 🧑‍🎨  Works great with React + React Native. And probably with all the other front-end frameworks.

# Usage

## Example apps

You can play clone this project and play with local examples

```bash
git clone git@github.com:@trpc/trpc.git
cd trpc
yarn

yarn example:hello
```

Here's all the example apps:

| Command                   | Live URL                                           | Example path                                                   | Description                                      |
| ------------------------- | -------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------ |
| `yarn example:chat`       | [chat.trpc.io](https://chat.trpc.io)               | [`./examples/next-ssg-chat`](./examples/next-ssg-chat)         | Next.js real-time chat example with SSG & Prisma |
| `yarn example:hello`      | [hello-world.trpc.io](https://hello-world.trpc.io) | [`./examples/next-hello-world`](./examples/next-hello-world)   | Minimal Next.js example                          |
| `yarn example:standalone` | _n/a_                                              | [`./examples/standalone-server`](./examples/standalone-server) | Standalone TRPC server + node client             |
| `yarn example:playground` | _n/a_                                              | [`./examples/playground`](./examples/playground)               | Express server + node client                     |

## Getting started with Next.js

The code here is taken from [`./examples/next-hello-world`](./examples/next-hello-world).

<details><summary>0. Install deps</summary>

```bash
yarn add @trpc/client @trpc/server @trpc/react zod react-query
```

- tRPC wraps a tiny layer of sugar around [react-query](https://react-query.tanstack.com/overview) when using React which gives you type safety and auto completion of your routes
- Zod is a great validation lib that works well, but tRPC also works out-of-the-box with yup/myzod/ts-json-validator/[..] - [see test suite](./packages/server/test/validators.test.ts)

</details>
<details><summary>1. Create an API handler</summary>

Create a file at `./pages/api/trpc/[...trpc].ts`

Paste the following code:

```ts
import * as trpc from '@trpc/server';
import * as z from 'zod';

// The app's context - is typically generated for each request
export type Context = {};
const createContext = ({
  req,
  res,
}: trpc.CreateNextContextOptions): Context => {
  return {};
};

function createRouter() {
  return trpc.router<Context>();
}
// Important: only use this export with SSR/SSG
export const appRouter = createRouter()
  // Create route at path 'hello'
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
export default trpc.createNextApiHandler({
  router: appRouter,
  createContext,
});

```
</details>
<details><summary>2. Create a trpc client</summary>


Create `./utils/trpc.ts`

```tsx
import { createReactQueryHooks, createTRPCClient } from '@trpc/react';
import { QueryClient } from 'react-query';
// Type-only import:
// https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export
import type { AppRouter, Context } from '../pages/api/trpc/[...trpc]';

export const client = createTRPCClient<AppRouter>({
  url: '/api/trpc',
});

export const trpc = createReactQueryHooks<AppRouter, Context>({
  client,
  queryClient: new QueryClient(),
});
```
</details>
<details><summary>3. Configure `_app.tsx`</summary>


```tsx
import type { AppProps /*, AppContext */ } from 'next/app';
import { QueryClientProvider } from 'react-query';
import { Hydrate } from 'react-query/hydration';
import { trpc } from '../utils/trpc';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <QueryClientProvider client={trpc.queryClient}>
      <Hydrate state={trpc.useDehydratedState(pageProps.dehydratedState)}>
        <Component {...pageProps} />
      </Hydrate>
    </QueryClientProvider>
  );
}
export default MyApp;
```
</details>
<details><summary>4. Start consuming your data!</summary>


```tsx
import Head from 'next/head';
import { trpc } from '../utils/trpc';

export default function Home() {
  // try typing here to see that you get autocompletioon & type safety on the route name
  const helloNoArgs = trpc.useQuery(['hello']);
  const helloWithArgs = trpc.useQuery(['hello', { text: 'client' }]);

  // try to uncomment next line to show type checking:
  // const helloWithInvalidArgs = trpc.useQuery(['hello', { text: false }]);

  console.log(helloNoArgs.data); // <-- hover over this object to see it's type inferred

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
</details>


## Defining routes

Defining routes is the same for queries, mutations, and subscription with the exception that subscriptions needs to return a `Subscription`-instance.

<details><summary>Example query without input argument</summary>

```tsx
import * as trpc from '@trpc/server';

export const appRouter = trpc.router()
  // Create route at path 'hello'
  .query('hello', {
    resolve({ ctx }) {
      return {
        greeting: `hello world`,
      };
    },
  });

export type AppRouter = typeof appRouter;
```

</details>
<details><summary>Example query with input argument</summary>

```tsx
import * as trpc from '@trpc/server';
import * as z from 'zod';

export const appRouter = trpc.router()
  .query('hello', {
    input: z
      .object({
        text: z.string().optional(),
      })
      .optional(),
    resolve({ input }) {
      return {
        greeting: `hello ${input?.text ?? 'world'}`,
      };
    },
  });

export type AppRouter = typeof appRouter;
```

</details>
<details><summary>To add multiple endpoints, you must chain the calls</summary>

```tsx
import * as trpc from '@trpc/server';

export const appRouter = trpc.router()
  .query('hello', {
    resolve({ ctx }) {
      return {
        text: `hello world`,
      };
    },
  })
  .query('bye', {
    resolve({ ctx }) {
      return {
        text: `goodbye`,
      };
    },
  });

export type AppRouter = typeof appRouter;
```

</details>

## Merging routes

Writing all API-code in your code in the same file is a bad idea. It's easy to merge routes with other routes. Thanks to TypeScript 4.1 template literal types we can also prefix the routes without breaking type safety.

<details><summary>Example code</summary>

```ts
const posts = createRouter()
  .mutation('create', {
    input: z.object({
      title: z.string(),
    }),
    resolve: ({ input }) => {
      // ..
      return {
        id: 'xxxx',
        ...input,
      }
    },
  })
  .query('list', {
    resolve() {
      // ..
      return []
    }
  });

const users = createRouter()
  .query('list', {
    resolve() {
      // ..
      return []
    }
  });


const appRouter = createRouter()
  .merge('users.', users) // prefix user routes with "users."
  .merge('posts.', posts) // prefix poosts routes with "posts."
  ;
```

</details>

## Data transformers

You are able to serialize the response data & input args (in order to be able to transparently use e.g. standard `Date`s). The transformers need to be added both to the server and the client.

- `createNextApiHandler()` in [`./examples/next-ssg-chat/[...trpc.ts]`](./examples/next-ssg-chat/pages/api/trpc/%5B...trpc%5D.ts), and
- `createTRPCClient` in [`./examples/next-ssg-chat/pages/_app.tsx`](./examples/next-ssg-chat/pages/_app.tsx)

## Server-side rendering (SSR / SSG)

See the [chat example](./examples/next-ssg-chat) for a working example.


<details><summary>In `getStaticProps`</summary>

```tsx
import { trpc } from '../utils/trpc'
import { appRouter } from './api/trpc/[...trpc]'; // Important - only ever import & use this in the SSR-methods

export async function getStaticProps() {
  await trpc.prefetchQueryOnServer(appRouter, {
    path: 'messages.list',
    input: null,
    ctx: {} as any,
  });
  return {
    props: {
      dehydratedState: trpc.dehydrate(),
    },
    revalidate: 1,
  };
}
```
</details>
<details><summary>In _app.tsx</summary>

```tsx
import type { AppProps /*, AppContext */ } from 'next/app';
import { QueryClientProvider } from 'react-query';
import { Hydrate } from 'react-query/hydration';
import { trpc } from '../utils/trpc';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <QueryClientProvider client={trpc.queryClient}>
      <Hydrate state={trpc.useDehydratedState(pageProps.dehydratedState)}>
        <Component {...pageProps} />
      </Hydrate>
    </QueryClientProvider>
  );
}
export default MyApp;
```
</details>

This will cache the `messages.list` so it's instant when a user visits the page.

# Further reading

## HTTP Methods ↔️ endpoint type mapping

| HTTP Method | Mapping           | Notes                                                                             |
| ----------- | ----------------- | --------------------------------------------------------------------------------- |
| `GET`       | `.query()`        | Input in query string                                                             |
| `POST`      | `.mutation()`     | Input in post body                                                                |
| `PATCH`     | `.subscription()` | Experimental API using long-pulling. Implementation details are likely to change. |

## Relationship to GraphQL

> 🚧  Docs in progress

GraphQL is amazing; I'm a massive fan & have made many GraphQL-servers and the ecosystem around it is mature with things like Apollo & Relay. It's amazing to be able to make a flexible API where each consumer can pick just the data needed for it. If you are already have a custom GraphQL-server for your project, you're probably in no need for tRPC.

The thing is, GraphQL isn't that easy to get right - ACL is needed to be solved on a per-type basis, complexity analysis, and performance are non-trivial things to get right. 

We've taken a lot of inspiration from GraphQL & if you've made GraphQL-servers before you'll be familiar with the concept of input types and resolvers.

## Alternative projects

> 🚧  Docs in progress

frameworks - blitzjs, redwood, [...] 


....


# Development

```bash
yarn install
```

This will install all dependencies in each project, build them, and symlink them via Lerna

## Development workflow

```bash
git clone git@github.com:@trpc/trpc.git
cd trpc
yarn
```

In one terminal, run tsdx watch in parallel:

```bash
yarn dev
```

This builds each package to `<packages>/<package>/dist` and runs the project in watch mode so any edits you save inside `<packages>/<package>/src` cause a rebuild to `<packages>/<package>/dist`. The results will stream to to the terminal.

# Contributors ✨

Original [`0.x`](https://github.com/trpc/trpc/tree/v0.x)-version was created by [colinhacks](https://github.com/colinhacks) and `>1.x` was created by [KATT](https://twitter.com/alexdotjs).

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tr>
    <td align="center"><a href="https://twitter.com/alexdotjs"><img src="https://avatars.githubusercontent.com/u/459267?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Alex Johansson</b></sub></a><br /><a href="#ideas-KATT" title="Ideas, Planning, & Feedback">🤔</a> <a href="https://github.com/trpc/trpc/commits?author=KATT" title="Code">💻</a> <a href="https://github.com/trpc/trpc/commits?author=KATT" title="Tests">⚠️</a> <a href="https://github.com/trpc/trpc/commits?author=KATT" title="Documentation">📖</a> <a href="#example-KATT" title="Examples">💡</a> <a href="#maintenance-KATT" title="Maintenance">🚧</a></td>
    <td align="center"><a href="https://colinhacks.com/"><img src="https://avatars.githubusercontent.com/u/3084745?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Colin McDonnell</b></sub></a><br /><a href="#ideas-colinhacks" title="Ideas, Planning, & Feedback">🤔</a> <a href="https://github.com/trpc/trpc/commits?author=colinhacks" title="Code">💻</a> <a href="https://github.com/trpc/trpc/commits?author=colinhacks" title="Tests">⚠️</a> <a href="https://github.com/trpc/trpc/commits?author=colinhacks" title="Documentation">📖</a></td>
  </tr>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->



---

[![Powered by Vercel](./images/powered-by-vercel.svg "Powered by Vercel")](https://vercel.com/?utm_source=trpc&utm_campaign=oss)
