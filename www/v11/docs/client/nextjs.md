---
id: overview
title: Next.js Integration
sidebar_label: "Next.js Integration"
slug: /client/nextjs
section: "Client Usage"
order: 67
---

## tRPC + Next.js

Next.js makes it easy to build a client and server together in one codebase. tRPC makes it easy to share types between them, ensuring typesafety for your application's data fetching.

tRPC provides first-class support for both the **App Router** and the **Pages Router**. Choose the guide that matches your project:

## App Router

The recommended approach for new Next.js projects. Uses React Server Components, the [fetch adapter](/docs/server/adapters/fetch), and [`@trpc/tanstack-react-query`](/docs/client/tanstack-react-query).

Key features:

- **Server Components** - Prefetch data on the server and stream it to the client
- **Streaming** - Leverage Next.js streaming for optimal loading performance
- **Suspense** - Use `useSuspenseQuery` with Suspense boundaries for loading states

**[Get started with App Router &rarr;](/docs/client/nextjs/app-router-setup)**

## Pages Router

Uses the [Next.js adapter](/docs/server/adapters/nextjs) for the API, and the same client as the App Router: [`@trpc/tanstack-react-query`](/docs/client/tanstack-react-query).

Key features:

- **Server-side rendering** - Prefetch a page's queries in `getServerSideProps` and render them into the first HTML. Read more about [SSR](/docs/client/nextjs/pages-router/ssr).
- **Static site generation** - Prefetch queries in `getStaticProps` and generate static HTML files. Read more about [SSG](/docs/client/nextjs/pages-router/ssg).

:::warning Deprecated
`createTRPCNext`, `withTRPC` and `ssr: true` from `@trpc/next` are deprecated. They're built on the [classic React Query integration](/docs/client/react) (`@trpc/react-query`), which only gets bug fixes and will be removed in the next major version of tRPC. See [Moving from `createTRPCNext`](/docs/client/nextjs/pages-router/setup#moving-from-createtrpcnext). The experimental App Router helpers in `@trpc/next/app-dir` aren't affected.
:::

**[Get started with Pages Router &rarr;](/docs/client/nextjs/pages-router/setup)**

## Choosing between App Router and Pages Router

|                     | App Router                                   | Pages Router                                                    |
| ------------------- | -------------------------------------------- | --------------------------------------------------------------- |
| **Recommended for** | New projects                                 | Existing Pages Router projects                                  |
| **Data fetching**   | Server Components, `prefetchQuery`           | `prefetchQuery` in `getServerSideProps` or `getStaticProps`     |
| **Server adapter**  | [Fetch adapter](/docs/server/adapters/fetch) | [Next.js adapter](/docs/server/adapters/nextjs)                 |
| **Client package**  | `@trpc/tanstack-react-query`                 | `@trpc/tanstack-react-query`                                    |
| **Provider setup**  | `TRPCProvider` in the root layout            | `TRPCProvider` and `HydrationBoundary` in `_app`                |

:::tip
If you're starting a new project, we recommend the App Router. If you have an existing Pages Router project, tRPC works well with it and is fully supported.
:::
