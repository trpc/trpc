---
title: "Announcing tRPC v11"
description: "Although tRPC v11 has been production-ready for a long time via the @next tag, we've gotten kinda addicted to adding new features without being sticklers to semantic versioning. Today, we're excited to finally be ripping off the band-aid and announcing the official release of tRPC v11!"
date: "2025-03-21"
authors: [{"image":"https://trpc.io/img/logo.svg","name":"tRPC","title":"The tRPC Team","url":"https://trpc.io/"}]
discussion: 6622
---

Although tRPC v11 has been production-ready for a long time via the `@next` tag, we've gotten kinda addicted to adding new features without being sticklers to semantic versioning. Today, we're excited to _finally_ be ripping off the band-aid and announcing the official release of tRPC v11!

Since our last major version release in November 2022, the tRPC community has seen substantial growth:

- We now have over [35,000 stars on GitHub](https://github.com/trpc/trpc)
- [A Discord community](https://trpc.io/discord) with over 5,000 members
- [700k+ weekly npm downloads](https://www.npmjs.com/package/@trpc/server)
- [100s of contributors](https://github.com/trpc/trpc/graphs/contributors)
- [An _awesome_ ecosystem of extensions, examples, and content](/docs/community/awesome-trpc)

With the launch of tRPC v11, we're excited to share that v11 is already being used in production by many large TypeScript projects thanks to its stable evolution on our `@next` channel

For new projects, you can get up and running with an [example application](/docs/community/awesome-trpc#-starting-points-example-projects-etc) to learn about tRPC v11. For projects still on tRPC v10, [visit the v11 migration guide](/docs/migrate-from-v10-to-v11).

## Overview of changes

v11 is a largely backward-compatible release with v10, but it brings a lot of new features and improvements. Here are the highlights:

### TanStack Query v5 support

When [TanStack Query v5](https://tanstack.com/blog/announcing-tanstack-query-v5) was released it necessitated some breaking changes within tRPC's react-query integration. This has been available since quite early on via the `@next` tag, but now it's officially released. Many projects have already chosen to upgrade and are enjoying the benefits of full React Suspense support and many other improvements, for advice on migrating your tRPC React client code you can follow [TanStack Query's own migration guide](https://tanstack.com/query/v5/docs/react/guides/migrating-to-v5).

### New TanStack React Query integration

[See the blog post](/blog/introducing-tanstack-react-query-client)

### FormData / Non-JSON Content Types support

One of our most requested features is the ability to send and receive more than simply JSON data. With tRPC v11, you can now send and receive data in a variety of [non-json content types](/docs/server/non-json-content-types), `FormData`, and binary types such as `Blob`, `File` and `Uint8Array`. You can find an example of how to use these content types [here](https://github.com/trpc/trpc/tree/next/examples/minimal-content-types)

```ts twoslash
// @target: esnext
// @filename: trpc.ts
import { initTRPC } from '@trpc/server';

const t = initTRPC.create();

export const publicProcedure = t.procedure;
export const router = t.router;

// @filename: server.ts
// ---cut---
import { publicProcedure, router } from './trpc';
import { octetInputParser } from '@trpc/server/http';
import { z } from 'zod';

const appRouter = router({
  formData: publicProcedure
    .input(z.instanceof(FormData))
    .mutation(async ({ input }) => {
      //                ^?
    }),
  file: publicProcedure
    .input(octetInputParser)
    .mutation(async ({ input }) => {
      //                ^?
    }),
});
```

### React Server Components / Next.js App Router

While you have been able to use tRPC with Next.js App Router from day 1, by either:

- using a server-centric approach using async/await with either [`createCaller`](/docs/server/server-side-calls) or [`createTRPCClient`](/docs/client/vanilla),
- or a client-centric approach using the [React Query integration](/docs/client/react) and client-side hooks,

The bridge in between has been a bit rough around the edges. Revalidation patterns are mixed when having to maintain different data fetching patterns, resulting in a less than ideal developer experience which does not live up to tRPC's standards.

To fix this, we've improved support for React Server Components (RSC) and added prefetch helpers to make it easier to utilize the power of RSCs running exclusively on the server, in combination with the highly dynamic client-side cache of React Query.
You can now start executing a procedure on the server in a RSC, pick up the pending promise on the client, and automatically hydrate the React Query cache clientside. This enables you to build highly dynamic applications without suffering from server-client waterfalls. You can read more in our [Server Components documentation](/docs/client/react/server-components).

In addition to these new prefetch patterns, we've added experimental support for server functions. You can read more about this in [our blog post](/blog/trpc-actions). We plan to keep iterating on this feature as server functions become a more established pattern in the ecosystem.

We have also worked with the [TanStack team to help design the APIs for their server functions](https://x.com/tannerlinsley/status/1844500352655335522). Our goal is to split out parts of tRPC's powerful middleware system into a separate package which can be used throughout the ecosystem.

### Streaming Responses from Queries and Mutations

We've introduced [httpBatchStreamLink](/docs/client/links/httpBatchStreamLink), which allows you to stream responses from queries. This is helpful when working with large datasets or where you need to process data in real-time and dispatch to the frontend as you go. This is not a replacement for subscriptions, but is another option in your toolbelt.

```ts twoslash
// @target: esnext
// @filename: trpc.ts
import { initTRPC } from '@trpc/server';

const t = initTRPC.create({});

export const router = t.router;
export const publicProcedure = t.procedure;

// ---cut---
// @filename: server.ts
import { publicProcedure, router } from './trpc';

const appRouter = router({
  examples: {
    iterable: publicProcedure.query(async function* () {
      let i = 0;
      while (true) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        yield i++;
      }
    }),
  },
});

export type AppRouter = typeof appRouter;


// @filename: client.ts
import { createTRPCClient, httpBatchStreamLink } from '@trpc/client';
import type { AppRouter } from './server';

const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchStreamLink({
      url: 'http://localhost:3000',
    }),
  ],
});
const iterable = await trpc.examples.iterable.query();
//      ^?

for await (const value of iterable) {
  console.log('Iterable:', value);
  //                         ^?
}
```

### Shorthand Router Definitions

We've introduced a new shorthand syntax for defining your router to simplify the process of defining your routes. [Docs](/docs/server/routers#inline-sub-router)

```ts twoslash
import { initTRPC } from '@trpc/server';

const t = initTRPC.create();
const publicProcedure = t.procedure;
const router = t.router;
// ---cut---
const appRouter = router({
  // Shorthand plain object for creating a sub-router
  nested1: {
    proc: publicProcedure.query(() => '...'),
  },
  // Equivalent of:
  nested2: router({
    proc: publicProcedure.query(() => '...'),
  }),
});
```

### Subscriptions: Server-Sent Events and other Improvements

- tRPC v11 introduces a new way to handle subscriptions using [Server-Sent Events (SSE)](/docs/server/subscriptions#websockets-or-server-sent-events). This is a great way to handle real-time updates in your application without the need for more complex WebSockets. We recommend using this in the first instance going forward.
- We've added support for JavaScript [generators in subscriptions](/docs/server/subscriptions#cleanup-of-side-effects). This allows you to write more complex subscription handlers which can yield multiple values over time, and clean up when finished, in a very JS-native way.
- Subscriptions now support [Output validators](/docs/server/subscriptions#output-validation), improving the type-safety of your subscription handlers.

### Goodbye v9 `.interop()`-mode

In tRPC v10, we introduced the `.interop()`-mode to provide a smooth migration path for tRPC v9 users. With tRPC v11, we've removed the `.interop()`-mode. If you're still using the `.interop()`-mode, you can use the [v10 migration guide](/v10/docs/migrate-from-v9-to-v10) to complete your transition to the APIs used by tRPC today.

## Migrating to v11

If you're currently using tRPC v10, you can follow the [migration guide](/docs/migrate-from-v10-to-v11) to upgrade to v11. The migration guide covers all the breaking changes and new features in v11.

## Thank you!

From the whole tRPC Core Team, thank you for using and supporting tRPC.

---

- Follow [@trpcio](https://twitter.com/trpcio) on Twitter.
- Join our [Discord-community](https://trpc.io/discord)
- [Try out tRPC in your browser](https://trpc.io/#try-it-out)

<a
      id="sponsor-button"
      href="/sponsor"
      class="group flex h-12 w-max items-center gap-4 rounded-lg border-2 bg-zinc-200 px-4 py-2 transition hover:bg-zinc-100 dark:border-zinc-900 dark:bg-zinc-800 hover:dark:border-zinc-700 hover:dark:bg-zinc-900"
    >
      <svg
        role="img"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        class="aspect-square h-6 fill-pink-500 transition-transform duration-200 ease-in group-hover:scale-110"
      >
        <path d="M17.625 1.499c-2.32 0-4.354 1.203-5.625 3.03-1.271-1.827-3.305-3.03-5.625-3.03C3.129 1.499 0 4.253 0 8.249c0 4.275 3.068 7.847 5.828 10.227a33.14 33.14 0 0 0 5.616 3.876l.028.017.008.003-.001.003c.163.085.342.126.521.125.179.001.358-.041.521-.125l-.001-.003.008-.003.028-.017a33.14 33.14 0 0 0 5.616-3.876C20.932 16.096 24 12.524 24 8.249c0-3.996-3.129-6.75-6.375-6.75zm-.919 15.275a30.766 30.766 0 0 1-4.703 3.316l-.004-.002-.004.002a30.955 30.955 0 0 1-4.703-3.316c-2.677-2.307-5.047-5.298-5.047-8.523 0-2.754 2.121-4.5 4.125-4.5 2.06 0 3.914 1.479 4.544 3.684.143.495.596.797 1.086.796.49.001.943-.302 1.085-.796.63-2.205 2.484-3.684 4.544-3.684 2.004 0 4.125 1.746 4.125 4.5 0 3.225-2.37 6.216-5.048 8.523z" />
      </svg>
      <span class="font-semibold text-zinc-900 no-underline dark:text-zinc-300">
        Become a Sponsor!
      </span>
    </a>
