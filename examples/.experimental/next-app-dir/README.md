## 🚧🚧 🚧 🚧 🚧 🚧 🚧 🚧 🚧 This is experimental and is subject to change 🚧 🚧 🚧 🚧 🚧 🚧 🚧 🚧 🚧

This is a playground repo for an offical tRPC + Next.js App directory adapter.

> **Note**
> You can already use tRPC with app directory, by:
>
> - using `@trpc/client` directly in components (both RSC and non-RSC)
> - use `@trpc/next` for client components

### Current progress

- [x] Proof of concept of RSC support
- [x] Proof of concept of server actions
- [x] Implement caching
- [ ] Implement cache invalidation on server calls
- [ ] Implement cache invalidation on client calls
- [ ] Get community feedback
- [ ] Make server calls invalidate client calls and vice verse
- [ ] Test it heavily
  - [ ] Remove codecov ignore
  - [ ] Delete all fixme/todo comments
- [ ] Finalize API

### Contributing

Please join our [Discord](https://trpc.io/discord) if you want to discuss how we approach this.

If you want to change this repo, you go to https://github.com/trpc/trpc/tree/main/examples/.experimental/next-app-dir

## Overview

> **Warning**
> Don't use this in production unless you are okay with large refactoring.

Create a tRPC client that you can use **the same way**, no matter if you are in a server components

Examples:

- [./src/app/ClientGreeting.tsx](./src/app/ClientGreeting.tsx)
- [./src/app/ServerGreeting.tsx](./src/app/ServerGreeting.tsx)

### Setup

#### 1. Create an API handler for tRPC

Example: [`/src/app/api/trpc/[trpc]/route.ts`](/src/app/api/trpc/[trpc]/route.ts)

#### 2. Create a local tRPC package with different entrypoints for `"use client"` & `"use server"`.

Files of note:

- [`./package.json`](./package.json)
- [`./src/trpc`](./src/trpc)
