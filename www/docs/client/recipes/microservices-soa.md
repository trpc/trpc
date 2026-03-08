---
title: Microservices + SOA
sidebar_label: Microservices + SOA
---

tRPC can be used in service-oriented architectures, usually with one client-facing router contract and service-specific backends behind custom link logic.

This approach is powerful, but adds operational complexity. Prefer a single router unless your organization already requires service boundaries.

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
