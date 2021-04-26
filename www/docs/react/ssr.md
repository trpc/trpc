---
id: ssr
title: Server-side Rendering (SSR / SSG)
sidebar_label: Server-side Rendering (SSR / SSG)
slug: /ssr
---


:::info
- Working examples:
  - [examples/next-prisma-todomvc](https://github.com/trpc/trpc/tree/main/examples/next-prisma-todomvc)
  - [examples/next-hello-world](https://github.com/trpc/trpc/tree/main/examples/next-hello-world)
- Follow [Next.js-guide](nextjs) before doing the below
:::


## Option A: Using SSR

You don't have to do anything(!) apart from setting `{ ssr: true }` in your `withTRPC()`-setup; see [Getting Started with Next.js](/docs/nextjs#option-a-using-server-side-rendering).

If there's a certain query you don't want to be fetched on the server you can supply `{ ssr: false }` like this:

```tsx
const myQuery = trpc.useQuery(['posts'], { ssr: false });
```

## Option B: Using SSG


See [Using SSG in the Getting Started guide](/docs/nextjs#option-b-using-ssg).
