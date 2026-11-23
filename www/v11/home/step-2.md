```ts twoslash
import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
const t = initTRPC.create();
const appRouter = t.router({});
// ---cut---
const { listen } = createHTTPServer({
  router: appRouter,
});

// The API will now be listening on port 3000!
listen(3000);
```
