---
title: Making your own Client
sidebar_label: Making your own Client
---

If your framework expects an observable-first API (for example Angular-style service layers), you can keep tRPC's transport and types, and expose your own client surface.

The key is to call tRPC with an untyped client internally and wrap calls in your own observable abstraction.

## Why this pattern works

`createTRPCUntypedClient` gives you direct runtime access to procedure calls by `path` and `input`.
That is ideal when your framework wants:

- Service methods with framework-specific return types
- Centralized retry/auth/error behavior
- Request cancellation integration with framework lifecycle hooks

Your wrapper owns the runtime shape, while tRPC still owns transport and procedure contracts.

```ts twoslash
// @filename: server.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

// @filename: client.ts
// ---cut---
import { createTRPCUntypedClient, httpBatchLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { AppRouter } from './server';

const untypedClient = createTRPCUntypedClient<AppRouter>({
  links: [httpBatchLink({ url: 'http://localhost:3000/trpc' })],
});

export function query$(path: string, input: unknown) {
  return observable<unknown>((observer) => {
    untypedClient
      .query(path, input)
      .then((data) => {
        observer.next(data);
        observer.complete();
      })
      .catch((error: Error) => {
        observer.error(error);
      });

    return () => {
      // hook cancellation into your framework if needed
    };
  });
}
```

From here, map `query$` / `mutation$` into your framework's preferred primitives and inject it where needed.

## Recommended architecture

1. Build one internal "transport client" (like `untypedClient`) near app boot.
2. Create framework-facing service methods (`userService.getById$`, `postService.create$`, etc.).
3. Centralize cross-cutting concerns in one place:
   - Auth headers
   - Retry policy
   - Logging/tracing
   - Error normalization
4. Keep UI/component layers unaware of raw tRPC path strings.

## Angular-specific notes

If you're integrating with Angular:

- Adapt this observable wrapper into RxJS streams returned by injectable services
- Wire request cancellation to subscription teardown
- Map transport errors into your domain-specific error types for better component ergonomics

## Pitfalls to avoid

- **Stringly-typed paths everywhere**: keep path strings in one module
- **Leaking transport errors to UI**: normalize errors in the wrapper layer
- **No cancellation**: long-running calls should be abortable

## Related references

- [Vanilla client setup](../vanilla/setup.mdx)
- [Links overview](../links/overview.md)
- [Client internals and helpers in source](https://github.com/trpc/trpc/tree/main/packages/client/src)
