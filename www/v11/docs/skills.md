---
id: skills
title: Agent Skills
sidebar_label: Agent Skills
slug: /skills
description: Set up and use TanStack Intent to provide AI agent skills for tRPC
section: "tRPC"
order: 1.5
skill:
  name: trpc-router
  package: "@trpc/server"
  type: core
  description: "Entry point for all tRPC skills. Decision tree routing by task:
    initTRPC.create(), t.router(), t.procedure, createTRPCClient, adapters,
    subscriptions, React Query, Next.js, links, middleware, validators, error
    handling, caching, FormData, OpenAPI, multiple services. Includes a minimal
    working server and client."
  include:
    - quickstart#serving-the-api
    - quickstart#using-your-new-backend-on-the-client
---

tRPC ships [TanStack Intent](https://tanstack.com/intent/latest/docs/getting-started/quick-start-consumers) skills to help AI coding agents work with tRPC. When your agent works on a task that matches a skill, it loads the skill's `SKILL.md` into context.

The skills ship inside `@trpc/server`, `@trpc/client`, `@trpc/tanstack-react-query`, `@trpc/next` and `@trpc/openapi`, so they're already in your `node_modules`.

## Setup

### 1. Run install

The `install` command adds skill-loading guidance to your agent's config file (`AGENTS.md`, `CLAUDE.md`, etc.):

```bash
npx @tanstack/intent@latest install
```

It covers the skills shipped in tRPC and your other installed packages.

### 2. Use skills in your workflow

When your agent works on a task that matches a skill, it loads the corresponding `SKILL.md` into context to guide implementation.

To see which skills are available:

```bash
npx @tanstack/intent@latest list
```

To load one yourself, for example the server auth skill:

```bash
npx @tanstack/intent@latest load @trpc/server#auth
```

### 3. Keep skills up-to-date

Skills version with library releases. When you update tRPC (e.g. `npm update @trpc/server`), you get the skills that match your installed version.

## Skills by task

Each skill is generated from a page of these docs. Load one with `npx @tanstack/intent@latest load <skill>`, for example `npx @tanstack/intent@latest load @trpc/server#server-setup`.

### Build the API

| Task | Skill |
| --- | --- |
| Initialize tRPC, define routers, procedures and context, export `AppRouter` | [`@trpc/server#server-setup`](./server/overview.md) |
| Add middleware and reusable base procedures | [`@trpc/server#middlewares`](./server/middlewares.md) |
| Validate inputs and outputs with Zod or another library | [`@trpc/server#validators`](./server/validators.md) |
| Throw, format and handle errors | [`@trpc/server#error-handling`](./server/error-handling.md) |
| Authenticate users and protect procedures | [`@trpc/server#auth`](./server/authorization.md) |
| Call procedures from server code or tests | [`@trpc/server#server-side-calls`](./server/server-side-calls.md) |
| Set HTTP cache headers on responses | [`@trpc/server#caching`](./server/caching.md) |
| Accept `FormData`, files and binary inputs | [`@trpc/server#non-json-content-types`](./server/non-json-content-types.md) |
| Stream real-time updates over SSE or WebSockets | [`@trpc/server#subscriptions`](./server/subscriptions.md) |
| Send `Date`, `Map`, `Set` and other rich types with superjson | [`@trpc/client#superjson`](./server/data-transformers.md) |
| Split the API across several services | [`@trpc/server#service-oriented-architecture`](./server/service-oriented-architecture.md) |

### Serve the API

| Task | Skill |
| --- | --- |
| Node.js HTTP server, the simplest setup | [`@trpc/server#adapter-standalone`](./server/adapters/standalone.md) |
| Express | [`@trpc/server#adapter-express`](./server/adapters/express.md) |
| Fastify | [`@trpc/server#adapter-fastify`](./server/adapters/fastify.md) |
| AWS Lambda behind API Gateway or a Function URL | [`@trpc/server#adapter-aws-lambda`](./server/adapters/aws-lambda.md) |
| Fetch API and edge runtimes: Cloudflare Workers, Deno, Vercel Edge, Astro, Remix | [`@trpc/server#adapter-fetch`](./server/adapters/fetch.md) |

### Call the API

| Task | Skill |
| --- | --- |
| Create a TypeScript client, infer types, handle errors | [`@trpc/client#client-setup`](./client/vanilla/setup.md) |
| Configure links: batching, streaming, splitting, WebSockets, SSE, retries | [`@trpc/client#links`](./client/links.md) |
| Use tRPC with TanStack React Query | [`@trpc/tanstack-react-query#react-query-setup`](./client/tanstack-react-query/setup.md) |
| Migrate from the classic `@trpc/react-query` client | [`@trpc/tanstack-react-query#react-query-classic-migration`](./client/tanstack-react-query/migrating.md) |
| Next.js App Router, including server components | [`@trpc/next#nextjs-app-router`](./client/nextjs/app-router-setup.md) |
| Next.js Pages Router, SSR and SSG | [`@trpc/next#nextjs-pages-router`](./client/nextjs/pages-router/setup.md) |
| Generate an OpenAPI spec and a REST client | [`@trpc/openapi#openapi`](./openapi.md) |

## Learn more

For full documentation on TanStack Intent, see the [Quick Start for Consumers](https://tanstack.com/intent/latest/docs/getting-started/quick-start-consumers) guide.
