---
id: context
title: Request Context
sidebar_label: Request Context
slug: /context
---

The `createContext()` function is called for each request and the result is propagated to all resolvers. You can use this to pass contextual data down to the resolvers.

## Example code

```ts title='server/context.ts'
import * as trpc from '@trpc/server';
import * as trpcNext from '@trpc/server/adapters/next';

// The app's context - is generated for each incoming request
export async function createContext(opts?: trpcNext.CreateNextContextOptions) {
  // Create your context based on the request object
  // Will be available as `ctx` in all your resolvers

  // This is just an example of something you'd might want to do in your ctx fn
  async function getUserFromHeader() {
    if (opts?.req.headers.authorization) {
      // const user = await decodeJwtToken(req.headers.authorization.split(' ')[1])
      // return user;
    }
    return null;
  }
  const user = await getUserFromHeader();

  return {
    user,
  };
}
export type Context = trpc.inferAsyncReturnType<typeof createContext>;
```

```ts title='server/routers/_app.ts'
import { TRPCError, initTRPC } from '@trpc/server';
import { Context } from '../context';

export const t = initTRPC.context<Context>().create();
```
