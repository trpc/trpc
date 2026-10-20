---
title: Should experimental types and methods carry the `experimental_` prefix too, or only exported values?
summary: Only exported values must be prefixed; experimental types and methods like `t.implement()` keep plain names, and 15 types are prefixed anyway.
area: stability
recommended: B
links:
  - kind: decision
    label: stability-jsdoc-tags
    url: ../decisions/stability-jsdoc-tags.md
  - kind: docs
    label: Stability
    url: https://v12.trpc.io/v12/docs/packages#stability
  - kind: proposal
    label: 21 Stability and JSDoc
    url: ../proposals/21-stability-and-jsdoc.md
  - kind: code
    label: trpc/jsdoc lint rule
    url: ../../tooling/oxlint-plugin/jsdoc.ts
---

# Should experimental types and methods carry the `experimental_` prefix too, or only exported values?

## Why it matters

The human asked that "the exported public apis should be prefixed". Built: values (functions, classes, consts) carry `experimental_`; types keep their names with an `@stability experimental` tag, as v11 did for `unstable_httpBatchStreamLink` (an `(agent, tentative)` call). Methods on stable objects can't be exports, so `t.implement(contract)` (contracts) and `handler.messagePort()` (message ports) keep plain names, and the call site doesn't show they're experimental (an `Open` bullet). The types aren't even consistent: in `@trpc12/trpc`, about 80 experimental types are plain (`DurableLinkOptions`, `ContractBuilder`), and 15 are prefixed (`experimental_LockOptions`, `experimental_ByteStream`), which the lint rule allows.

## Options

### A) Values only, as v11 did

Types and methods keep plain names, tagged `experimental`. The 15 prefixed types lose the prefix to match.

```ts twoslash
// ---cut-start---
import type { MessagePort } from 'node:worker_threads';
declare const parentPort: MessagePort;
import { createFetchHandler } from '@trpc12/trpc/server';
import { type LockOptionsA as LockOptions } from '../open/experimental-prefix-on-types-and-methods.ts';
import { appRouter as router, t } from './server.ts';
declare const contract: {};
const handler = createFetchHandler({
  router,
  createContext: () => ({ user: null }),
});
// ---cut-end---
import { experimental_lock } from '@trpc12/trpc/middleware';
import { experimental_contract } from '@trpc12/trpc/contract';

const lock: LockOptions = { ttl: '30 seconds' }; // was experimental_LockOptions, from '@trpc12/trpc/middleware'
const impl = t.implement(contract); // experimental, not visible here
handler.messagePort(parentPort);
```

- ✅ Fewest names to change on promotion; option types are reached through their prefixed value anyway
- ❌ `t.implement()` and `handler.messagePort()` look as settled as `t.router()`

### B) Values and methods; types keep their names

Experimental methods on stable objects get the prefix too; types stay plain, and the 15 prefixed ones lose it.

```ts twoslash
// @errors: 2339
// ---cut-start---
import type { MessagePort } from 'node:worker_threads';
declare const parentPort: MessagePort;
import {
  type FetchHandlerB as FetchHandler,
  type LockOptionsB as LockOptions,
  type TrpcRootB as TrpcRoot,
} from '../open/experimental-prefix-on-types-and-methods.ts';
import { t as root } from './server.ts';
declare const contract: {};
declare const t: TrpcRoot<typeof root>;
declare const handler: FetchHandler;
// ---cut-end---
import { experimental_contract } from '@trpc12/trpc/contract';

const lock: LockOptions = { ttl: '30 seconds' }; // was experimental_LockOptions, from '@trpc12/trpc/middleware'
const impl = t.experimental_implement(contract);
handler.experimental_messagePort(parentPort);
// Doesn't compile: the method carries the prefix now
t.implement(contract);
// promoting later: t.implement, with t.experimental_implement as `@deprecated Use implement`
```

- ✅ Every call a user writes shows its stage, which is what the prefix is for
- ✅ Types, which only appear next to their value, stay short
- ❌ Two methods renamed now, and a deprecated method alias on `t` and the handler at promotion

### C) Everything: values, methods and types

Every experimental type is prefixed too.

```ts twoslash
// ---cut-start---
import {
  type experimental_ContractBuilderC as experimental_ContractBuilder,
  type experimental_DurableLinkOptionsC as experimental_DurableLinkOptions,
  type TrpcRootC as TrpcRoot,
} from '../open/experimental-prefix-on-types-and-methods.ts';
import { t as root } from './server.ts';
declare const contract: {};
declare const t: TrpcRoot<typeof root>;
// ---cut-end---
import { experimental_durableLink } from '@trpc12/trpc/client';

// the types from '@trpc12/trpc/client' and '@trpc12/trpc/contract'
const durable: experimental_DurableLinkOptions = { retries: 3 };
type Builder = experimental_ContractBuilder<any>;

const impl = t.experimental_implement(contract);
```

- ✅ One rule for every name; an annotation shows the stage too
- ❌ About 80 type renames now, and a deprecated alias for each at promotion (types in `@trpc12/experimental-*` packages stay plain either way)
- ❌ Unlike v11, and long names in annotations

## Recommendation

**B.** The prefix is there so the code a user writes shows the stage, and a method call is code they write; a type is named next to the value that already says it. The 15 prefixed types lose the prefix so the rule is one sentence, and `trpc/jsdoc` can check the types side of it.

## Blocked until answered

- The `trpc/jsdoc` rule doesn't check types either way until this is answered, and the 15 prefixed types stay as they are.
- Under B or C, `t.implement()` and `handler.messagePort()` and their docs pages change before the first release.

## Details

- Prefixed types today: `experimental_ByteStream`, `experimental_ByteStreamError`, `experimental_ByteStreamOptions`, `experimental_ByteStreamSchema`, `experimental_Lock`, `experimental_Locker` (also a value), `experimental_LockerShape`, `experimental_LockMiddlewareOptions`, `experimental_LockOptions`, `experimental_RedisLockerOptions`, `experimental_UpstashOptions`, `experimental_UpstashRateLimiterStoreOptions`, `experimental_DurableLockerOptions`, `experimental_DurableRateLimiterStoreOptions`, `experimental_WorkersTracerOptions`.
- The decision's Open bullet also names `.route({ spec })`. In the code that's the `spec` key of the `route` meta (`.meta({ route: { spec } })`), read only by the experimental OpenAPI exports, so it's an option key rather than a method; B leaves option keys plain.
- `safe(iterable)` is an experimental overload of the stable `safe()`; no option can prefix an overload.
- Separate, still tentative: whether every API the human hasn't approved starts `experimental_` (decision-round queue item 67). Since that item was drafted, `rateLimit`, `Publisher` and `serveSocket` were prefixed on the human's 2026-10-19 ask, so what's left there is whether to audit older agent-designed stable exports.
