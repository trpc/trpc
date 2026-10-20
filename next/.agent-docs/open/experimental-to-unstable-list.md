---
title: Which `experimental_` exports should become `unstable_` before the first release?
summary: All 43 prefixed exports are `experimental_` (may go away). `unstable_` means "we want it, details may change"; nothing moves until the human picks.
area: stability
recommended: B
links:
  - kind: decision
    label: stability-jsdoc-tags
    url: ../decisions/stability-jsdoc-tags.md
  - kind: decision
    label: docs-experiments
    url: ../decisions/docs-experiments.md
  - kind: docs
    label: Stability
    url: https://v12.trpc.io/v12/docs/packages#stability
  - kind: proposal
    label: 21 Stability and JSDoc
    url: ../proposals/21-stability-and-jsdoc.md
  - kind: code
    label: promoted.ts (codemod)
    url: ../../packages/upgrade/src/promoted.ts
---

# Which `experimental_` exports should become `unstable_` before the first release?

## Why it matters

The human set three stages, as in v11: "experimental mean the feature might go away at any time, unstable means we want the general feature but how it works can change at any time". Every prefixed export today is `experimental_`, 43 values across nine entry points, plus ten `@trpc12/experimental-*` packages; there is no `unstable_` export yet. The decision says no export is renamed until the human confirms a list. An unstable feature's docs page is badged and shown, not hidden, so the choice also decides which hidden pages come out.

## Options

### A) None yet

Everything stays `experimental_` for 0.1; features move one by one as their docs experiment is reviewed.

```ts twoslash
import { experimental_contract } from '@trpc12/trpc/contract';
import { experimental_createOpenApiHandler } from '@trpc12/trpc/openapi';
import { experimental_createAction } from '@trpc12/trpc/actions';
```

- ✅ No renames, no pages unhidden; promotion happens with each experiment's review (`docs-experiments.md`)
- ❌ Users can't tell features tRPC is committed to from ones that might be dropped
- ❌ Server Actions has a listed docs page but an export that says it may go away

### B) The features whose shape a human already decided

Nine exports in three features become `unstable_`: contracts, the core of OpenAPI, and actions' factory (full list in Details). Everything else stays `experimental_`.

```ts twoslash
// before
import {
  experimental_contract,
  experimental_toContract,
} from '@trpc12/trpc/contract';
import { experimental_createOpenApiHandler } from '@trpc12/trpc/openapi';
import { experimental_createAction } from '@trpc12/trpc/actions';

// after (no alias: nothing has shipped)
// import { unstable_contract, unstable_toContract } from '@trpc12/trpc/contract';
// import { unstable_createOpenApiHandler } from '@trpc12/trpc/openapi';
// import { unstable_createAction } from '@trpc12/trpc/actions';
```

- ✅ Each one has `(human)` answers on its shape (contracts Q9.1, `experimental_openApiLink` "V1", `experimental_openApiReference` Q18.5, actions Q15.2 and Q15.3)
- ✅ Says to users which features tRPC means to keep
- ❌ The Contract-first and OpenAPI pages, hidden by the human on 2026-10-18, come back to the sidebar with an "Unstable" badge
- ❌ OpenAPI's helpers (`experimental_resolveRoute`, bracket notation, …) stay experimental next to an unstable handler

### C) B, plus the oRPC-parity features

Also `experimental_rateLimit`, `experimental_lock`, `experimental_Publisher`, `experimental_byteStream`, `experimental_messagePortLink` and `experimental_validationLink`, with their companions.

```ts
import { unstable_rateLimit, unstable_lock } from '@trpc12/trpc/middleware';
import { unstable_Publisher, unstable_byteStream } from '@trpc12/trpc/server';
import { unstable_validationLink } from '@trpc12/trpc/client';
```

- ✅ Matches oRPC v2's table, which the human made the parity target
- ❌ Against the human's 2026-10-19 answer on the partial parity rows (rate limits, byte stream inputs): "they should all be experimental_ and hidden by default in the docs"
- ❌ Their designs are the agent's, not reviewed

## Recommendation

**B.** It promotes only what the human already shaped, so `unstable_` means what the human defined: wanted, details may change. Everything the agent designed alone, and Cloudflare, which the human deferred ("it's experimental, we pick it up whenever we work on moving it from experimental to unstable"), stays experimental.

## Blocked until answered

- No `unstable_` export exists until this is answered. B or C renames the exports (and `PROMOTED` in the codemod stays empty, since nothing shipped), and badges and unhides the matching docs pages.

## Details

Every `experimental_` value today, by entry point. **Bold** ones become `unstable_` under B.

- `@trpc12/trpc/contract`: **`experimental_contract`**, **`experimental_toContract`**, **`experimental_isContractProcedure`** (also re-exports `experimental_openapi` and `experimental_openApiLink`)
- `@trpc12/trpc/openapi`: **`experimental_openapi`**, **`experimental_createOpenApiHandler`**, **`experimental_generateOpenApi`**, **`experimental_openApiLink`**, **`experimental_openApiReference`**, `experimental_generateContractFromOpenApi`, `experimental_resolveRoute`, `experimental_coerceBySchema`, `experimental_parseBracketNotation`, `experimental_toBracketNotation`
- `@trpc12/trpc/openapi/typescript`: `experimental_generateOpenApiFromTypes`
- `@trpc12/trpc/actions`: **`experimental_createAction`**, `experimental_createCallable` (its return shape is still a queued question), plus `experimental_coerceBySchema` and `experimental_parseBracketNotation`
- `@trpc12/trpc/client`: `experimental_validationLink`, `experimental_messagePortLink`, `experimental_socketLink`, `experimental_durableLink`
- `@trpc12/trpc/middleware`: `experimental_durable`, `experimental_lock`, `experimental_memoryLocker`, `experimental_redisLocker`, `experimental_Locker`, `experimental_LockConflict`, `experimental_LockTimeout`, `experimental_rateLimit`, `experimental_RateLimited`, `experimental_upstashRateLimiterStore`, `experimental_upstashRedis`
- `@trpc12/trpc/server`: `experimental_byteStream`, `experimental_Publisher`, `experimental_makeMemoryPublisher`
- `@trpc12/trpc/socket`: `experimental_serveSocket` (and `experimental_socketLink`)
- `@trpc12/trpc/cloudflare`: `experimental_createHibernatingWebSockets`, `experimental_hibernatingPublisher`, `experimental_connectionToken`, `experimental_durableLocker`, `experimental_durableLockObject`, `experimental_durableRateLimiterStore`, `experimental_durableRateLimitObject`, `experimental_workersTracer`

Packages, all staying `experimental-` under B: `@trpc12/experimental-nest`, `@trpc12/experimental-react`, `@trpc12/experimental-react-atom`, `@trpc12/experimental-tanstack-db` and the six `@trpc12/experimental-tanstack-{preact,vue,solid,svelte,angular,lit}-query`. A package that becomes unstable takes its final name with `unstable_*` exports (`@trpc12/nest` with `unstable_Implement`).

- Under C, the companions are `experimental_memoryLocker`, `experimental_redisLocker`, `experimental_Locker`, `experimental_LockConflict`, `experimental_LockTimeout`, `experimental_RateLimited`, `experimental_upstashRateLimiterStore`, `experimental_upstashRedis` and `experimental_makeMemoryPublisher`; `handler.messagePort()` goes with the link.
- Methods and types follow whatever [`experimental-prefix-on-types-and-methods.md`](./experimental-prefix-on-types-and-methods.md) decides: under B, `t.implement(contract)` is the contracts feature's method.
- List from `rg "export (function|const|class) experimental_" packages/*/src` and each entry point's `index.ts`, on `v12`.
