---
title: '`retryLink`'
description: Retry failed calls, by default queries that failed outside their typed errors, with backoff.
section: Client
parent: client/links
order: 5
v11: client/links/retryLink
---

`retryLink()` retries a failed call by running the rest of the chain again. By default it retries queries only, on errors outside the procedure's typed union (network failures, 5xx), up to three times, waiting 200, 400 and 800 ms. It never retries an aborted call.

```ts twoslash
// ---cut-start---
import type { AppRouter } from './server.ts';
// ---cut-end---
import {
  createTrpcClient,
  httpLink,
  retryLink,
  routerType,
} from '@trpc12/trpc/client';

const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [retryLink(), httpLink({ url: 'http://localhost:3000/trpc' })],
});
```

- `retries`: how many times to retry, 3 by default.
- `retry({ op, error, attempt })`: whether to retry this failure. It replaces the default rule, so check `op.type` yourself before retrying mutations.
- `delay(attempt, error)`: how long to wait before a retry, as an Effect `Duration.Input`: milliseconds, a string like `'2 seconds'` or a `Duration`. `2 ** attempt * 100` milliseconds by default.

Put it before the terminating link, and after [`dedupeLink`](./dedupe.md), so a shared query is retried once for all its callers.

## Waiting out a rate limit

`delay` gets the error, so a retry can wait as long as the server asks. A server that rate-limits can fail with `TOO_MANY_REQUESTS` and the wait in `data.retryAfter`, in milliseconds. Links see every error untyped, so `data` is `any` here:

```ts twoslash
// ---cut-start---
import { retryLink } from '@trpc12/trpc/client';
// ---cut-end---
retryLink({
  retry: (opts) => opts.error.code === 'TOO_MANY_REQUESTS',
  delay: (attempt, error) =>
    error.code === 'TOO_MANY_REQUESTS'
      ? error.data.retryAfter
      : 2 ** attempt * 100,
});
```

This `retry` replaces the default rule, so only rate-limited calls are retried, mutations included.
