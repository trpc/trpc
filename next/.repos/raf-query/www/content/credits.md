---
title: Credits
description: raf-query builds on the design of TanStack Query, and on React, Effect and TanStack Router.
section: Project
order: 1
---

## TanStack Query

raf-query's cache follows the design of [TanStack Query](https://tanstack.com/query), by [Tanner Linsley](https://github.com/tannerlinsley) and the TanStack team. Query keys and their hashing, `staleTime` and `gcTime`, structural sharing, deduplication, retries with backoff, window focus refetching, infinite queries and streaming SSR hydration all come from there, and so do many of the ideas, and much of the structure, in these docs.

If you're choosing between the two: TanStack Query is mature, supports every major framework, and has a far larger ecosystem. raf-query is an experiment in a narrower question, what that cache looks like when queries start in loaders and server components and components only read them. See [Comparison](./comparison.md).

TanStack Query is [MIT licensed](https://github.com/TanStack/query/blob/main/LICENSE), © Tanner Linsley.

## Built with

- [React](https://react.dev): `use()`, Suspense, transitions, actions and Server Components are what make render-as-you-fetch practical.
- [Effect](https://effect.website): the cache is written in it.
- [TanStack Router and Start](https://tanstack.com/router): the first integration, and what these docs run on.
- [Next.js](https://nextjs.org): the React Server Components integration.

## These docs

This site is a TanStack Start app that loads its own pages with raf-query: each page is a query with `staleTime: Infinity`, preloaded when you hover a link. Pages are markdown, compiled at build time with [unified](https://unifiedjs.com) and highlighted with [Shiki](https://shiki.style). The UI is built with [shadcn/ui](https://ui.shadcn.com) components and [Tailwind CSS](https://tailwindcss.com).

The demos run against a pretend server inside the page, so they work offline and you can change its latency and make it fail.

## License

raf-query is [MIT licensed](https://github.com/KATT/raf-query/blob/main/LICENSE.md).
