---
title: Microservices + SOA
sidebar_label: Microservices + SOA
---

tRPC can be used in service-oriented architectures, usually with one client-facing router contract and service-specific backends behind custom link logic.

This approach is powerful, but adds operational complexity. Prefer a single router unless your organization already requires service boundaries.

## Good fit vs. bad fit

Good fit:

- independent teams/services already exist
- strict deployment boundaries are required
- gateway-level contracts are part of platform architecture

Bad fit:

- one product team with tightly coupled domain logic
- early-stage product without proven service boundaries
- no operational capacity for distributed tracing/reliability engineering

```ts twoslash
// @filename: gateway.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

// @filename: client.ts
// ---cut---
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './gateway';

export const client = createTRPCClient<AppRouter>({
  links: [
    (runtime) => {
      const servers = {
        serviceA: httpBatchLink({ url: 'http://localhost:2021' })(runtime),
        serviceB: httpBatchLink({ url: 'http://localhost:2022' })(runtime),
      };

      return ({ op, ...rest }) => {
        const [serviceName, ...pathParts] = op.path.split('.');
        const target = servers[serviceName as keyof typeof servers];

        return target({
          ...rest,
          op: {
            ...op,
            path: pathParts.join('.'),
          },
        });
      };
    },
  ],
});
```

See the full SOA example in this repo:

- [examples/soa](https://github.com/trpc/trpc/tree/main/examples/soa)

## How this pattern maps to the SOA example

The repo example uses:

- multiple servers (`server-a`, `server-b`)
- a shared server library for consistent base configuration
- a client-side terminating link that routes calls by path prefix

This keeps a single typed client contract while dispatching to multiple service endpoints at runtime.

## Operational concerns to plan for

- **Shared contracts**: keep shared router types/versioning disciplined.
- **Error semantics**: normalize error envelopes across services.
- **Tracing**: propagate correlation IDs through links and service boundaries.
- **Fallback behavior**: decide what happens when one target service is down.

## Related references

- [SOA example README](https://github.com/trpc/trpc/tree/main/examples/soa)
- [Writing your own Link](./writing-your-own-link.md)
