---
id: header
title: Custom header
sidebar_label: Create Custom Header
slug: /header
---

The headers option can be customize in config when using `createTRPCNext` in nextjs or `createClient` in react.js.

`headers` can be both an object or a function. If it's a function it will gets called dynamically every http request.

```ts title='utils/trpc.ts'
import { createTRPCNext } from '@trpc/next';

// Import the router type from your server file
import type { AppRouter } from "@/server/routers/app";

export let token: string;

export const trpc = createTRPCNext<AppRouter>({
  config({ ctx }) {
    /**
    * Headers will be called on each request.
    */
    headers() {
      return {
        Authorization: token,
      }
    }
  }
});
```

### Example with auth login

```ts title='pages/auth.tsx'
const loginMut = trpc.auth.login.useMutation({
  onSuccess({ accessToken }) {
    token = accessToken;
  },
});
```

The `token` can be whatever you want it to be. It's entirely up to you whether that's just a client-side
variable that you update the value of on success or whether you store the token and pull it from local storage.
