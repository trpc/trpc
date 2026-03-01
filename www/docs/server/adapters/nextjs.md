---
id: nextjs
title: Next.js Adapter
sidebar_label: Next.js
slug: /server/adapters/nextjs
---

:::tip
tRPC's support for Next.js is far more expansive than just an adapter. This page covers a brief summary of how to set up the adapter. For complete documentation, see the [Next.js Integration guide](../../client/nextjs/introduction.mdx).
:::

## Example app

<table>
  <thead>
    <tr>
      <th>Description</th>
      <th>Links</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Next.js Minimal Starter</td>
      <td>
        <ul>
          <li><a href="https://githubbox.com/trpc/trpc/tree/main/examples/next-minimal-starter">CodeSandbox</a></li>
          <li><a href="https://github.com/trpc/trpc/tree/main/examples/next-minimal-starter">Source</a></li>
        </ul>
      </td>
    </tr>
  </tbody>
</table>

## Next.js example

Serving your tRPC router in a Next.js project is straight-forward. Just create an API handler in `pages/api/trpc/[trpc].ts` as shown below:

```ts twoslash title='pages/api/trpc/[trpc].ts'
// @filename: server/trpc/context.ts
import type { CreateNextContextOptions } from '@trpc/server/adapters/next';
export async function createContext(opts: CreateNextContextOptions) {
  return {};
}

// @filename: server/trpc/router/_app.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});

// @filename: pages/api/trpc/handler.ts
// ---cut---
import { createNextApiHandler } from '@trpc/server/adapters/next';
import { createContext } from '../../../server/trpc/context';
import { appRouter } from '../../../server/trpc/router/_app';

export default createNextApiHandler({
  router: appRouter,
  createContext,
});
```

## Handling CORS, and other Advanced usage

While you can usually just "set and forget" the API Handler as shown above, sometimes you might want to modify it further.

The API handler created by `createNextApiHandler` and equivalents in other frameworks is just a function that takes `req` and `res` objects. This means you can also modify those objects before passing them to the handler, for example to [enable CORS](/docs/client/cors).

```ts twoslash title='pages/api/trpc/[trpc].ts'
// @filename: server/trpc/context.ts
import type { CreateNextContextOptions } from '@trpc/server/adapters/next';
export async function createContext(opts: CreateNextContextOptions) {
  return {};
}

// @filename: server/trpc/router/_app.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});

// @filename: pages/api/trpc/[trpc].ts
// ---cut---
import type { NextApiRequest, NextApiResponse } from 'next';
import { createNextApiHandler } from '@trpc/server/adapters/next';
import { createContext } from '../../../server/trpc/context';
import { appRouter } from '../../../server/trpc/router/_app';

// create the API handler, but don't return it yet
const nextApiHandler = createNextApiHandler({
  router: appRouter,
  createContext,
});

// https://nextjs.org/docs/api-routes/introduction
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // We can use the response object to enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Request-Method', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', '*');

  // If you need to make authenticated CORS calls then
  // remove what is above and uncomment the below code

  // Allow-Origin has to be set to the requesting domain that you want to send the credentials back to
  // res.setHeader('Access-Control-Allow-Origin', 'http://example:6006');
  // res.setHeader('Access-Control-Request-Method', '*');
  // res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET');
  // res.setHeader('Access-Control-Allow-Headers', 'content-type');
  // res.setHeader('Referrer-Policy', 'no-referrer');
  // res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  // finally pass the request on to the tRPC handler
  return nextApiHandler(req, res);
}
```

## App Router (Route Handlers)

If you're using the Next.js **App Router**, use the [fetch adapter](fetch) instead, as App Router route handlers are based on the Web standard `Request` and `Response` objects. See the [App Router setup guide](/docs/client/nextjs/app-router-setup) for a complete walkthrough.

```ts twoslash title='app/api/trpc/[trpc]/route.ts'
// @filename: app/api/trpc/init.ts
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
export function createTRPCContext(opts: FetchCreateContextFnOptions) {
  return {};
}

// @filename: app/api/trpc/routers/_app.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});

// @filename: app/api/trpc/[trpc]/route.ts
// ---cut---

import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { createTRPCContext } from '../../trpc/init';
import { appRouter } from '../../trpc/routers/_app';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: createTRPCContext,
  });

export { handler as GET, handler as POST };
```
