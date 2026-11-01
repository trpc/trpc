---
title: "Next.js Integration"
description: ""
section: "Client Usage"
order: 67
---

## tRPC + Next.js

Next.js makes it easy to build a client and server together in one codebase. tRPC makes it easy to share types between them, ensuring typesafety for your application's data fetching.

tRPC provides first-class support for both the **App Router** and the **Pages Router**. Choose the guide that matches your project:

## App Router

The recommended approach for new Next.js projects. Uses React Server Components, the [fetch adapter](../server/adapters/fetch.md), and [`@trpc/tanstack-react-query`](./tanstack-react-query.md).

Key features:

- **Server Components** - Prefetch data on the server and stream it to the client
- **Streaming** - Leverage Next.js streaming for optimal loading performance
- **Suspense** - Use `useSuspenseQuery` with Suspense boundaries for loading states

**[Get started with App Router &rarr;](./nextjs/app-router-setup.md)**

## Pages Router

Uses `@trpc/next` which provides a higher-order component (HOC) and integrated hooks for the Pages Router data-fetching patterns.

Key features:

- **Server-side rendering** - Render pages on the server and hydrate them on the client. Read more about [SSR](./nextjs/pages-router/ssr.md).
- **Static site generation** - Prefetch queries on the server and generate static HTML files. Read more about [SSG](./nextjs/pages-router/ssg.md).
- **Automatic Provider Wrapping** - `@trpc/next` provides a HOC that wraps your app with the necessary providers automatically.

**[Get started with Pages Router &rarr;](./nextjs/pages-router/setup.md)**

## Choosing between App Router and Pages Router

|                     | App Router                                    | Pages Router                                        |
| ------------------- | --------------------------------------------- | --------------------------------------------------- |
| **Recommended for** | New projects                                  | Existing Pages Router projects                      |
| **Data fetching**   | Server Components, `prefetchQuery`            | `getServerSideProps`, `getStaticProps`, SSR via HOC |
| **Server adapter**  | [Fetch adapter](../server/adapters/fetch.md)  | [Next.js adapter](../server/adapters/nextjs.md)     |
| **Client package**  | `@trpc/tanstack-react-query`                  | `@trpc/next` + `@trpc/react-query`                  |
| **Provider setup**  | Manual `QueryClientProvider` + `TRPCProvider` | Automatic via `withTRPC()` HOC                      |

> [!TIP]
> If you're starting a new project, we recommend the App Router. If you have an existing Pages Router project, the Pages Router integration works well and is fully supported.
