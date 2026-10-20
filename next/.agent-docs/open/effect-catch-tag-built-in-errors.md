---
title: Should `Effect.catchTag('NOT_FOUND')` keep catching tRPC's built-in `NOT_FOUND` too?
summary: On the Effect client, `catchTag('NOT_FOUND')` catches a missing procedure as well as the server's `NOT_FOUND`; `err.defined` tells them apart.
area: effect
recommended: A
links:
  - kind: docs
    label: Effect client (errors)
    url: https://v12.trpc.io/v12/docs/client/effect#errors
  - kind: decision
    label: error-tags
    url: ../decisions/error-tags.md
  - kind: decision
    label: granular-errors
    url: ../decisions/granular-errors.md
  - kind: code
    label: createEffectClient JSDoc
    url: ../../packages/trpc/src/effect/index.ts
---

# Should `Effect.catchTag('NOT_FOUND')` keep catching tRPC's built-in `NOT_FOUND` too?

## Why it matters

Every `TrpcError`'s `_tag` is its code (the human's answer in `error-tags.md`), so `Effect.catchTag('NOT_FOUND', …)` on an Effect client call catches two errors: the procedure's own `NOT_FOUND` (`defined: true`, typed `data`) and tRPC's built-in one (`defined: false`), which a server sends when it doesn't have the procedure, as when a new client calls an old deploy. The handler runs for both, and only `err.defined` says which one it got. The docs (`client/effect.md#errors`) and the `createEffectClient` JSDoc already say so. This file asks the human to confirm that.

## Options

### A) Keep it, documented: `err.defined` tells them apart

`_tag` stays the code. The handler gets both and checks `defined` when it matters.

```ts twoslash
// @errors: 2345
// ---cut-start---
import { httpLink, routerType } from '@trpc12/trpc/client';
import { createEffectClient } from '@trpc12/trpc/effect';
import { Effect } from 'effect';
import type { AppRouter } from './server.ts';
const client = createEffectClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url: 'http://localhost:3000/trpc' })],
});
// ---cut-end---
const title = client.post.byId.query({ id: '1' }).pipe(
  Effect.map((post) => post.title),
  Effect.catchTag('NOT_FOUND', (err) =>
    Effect.succeed(err.defined ? `no post ${err.data.id}` : err.message),
  ),
);

// Doesn't compile: catchTag took both NOT_FOUNDs out of the union
title.pipe(Effect.catchTag('NOT_FOUND', () => Effect.succeed('')));
```

- ✅ Built, type-tested and documented; `catchTag` removes `NOT_FOUND` from the union, both kinds
- ✅ Same rule as `switch (err.code)` and `matchError()` on the Promise client
- ❌ A handler written for "no such post" also runs on a stale deploy unless it checks `err.defined`

### B) A helper that catches only the declared error

Add a helper (name to pick, `catchDefined` here) to `@trpc12/trpc/effect` that catches a code only when `defined` is `true`, leaving the built-in one in the error channel.

```ts twoslash
// ---cut-start---
import { httpLink, routerType } from '@trpc12/trpc/client';
import { createEffectClient } from '@trpc12/trpc/effect';
import { Effect } from 'effect';
import { catchDefinedB as catchDefined } from '../open/effect-catch-tag-built-in-errors.ts';
import type { AppRouter } from './server.ts';
const client = createEffectClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url: 'http://localhost:3000/trpc' })],
});
// ---cut-end---
const title = client.post.byId.query({ id: '1' }).pipe(
  Effect.map((post) => post.title),
  catchDefined('NOT_FOUND', (err) => Effect.succeed(`no post ${err.data.id}`)),
);
// a missing procedure's NOT_FOUND still fails the Effect
title.pipe(Effect.catchTag('NOT_FOUND', (err) => Effect.succeed(err.message)));
//                                       ^?
```

- ✅ The handler sees only the error its procedure declared
- ❌ A second way to catch a code, next to Effect's own `catchTag`
- ❌ New stable surface; each use costs instantiations like a `catchTag` (about 590 on the bench)

### C) Give built-in errors a different `_tag`

Only declared errors get their code as `_tag`; built-in ones get one tag, such as `TrpcError`, so `catchTag('NOT_FOUND')` catches the declared one only.

```ts twoslash
// @errors: 2345
// ---cut-start---
import { httpLink, routerType } from '@trpc12/trpc/client';
import { Effect } from 'effect';
import { createEffectClientC as createEffectClient } from '../open/effect-catch-tag-built-in-errors.ts';
import type { AppRouter } from './server.ts';
const client = createEffectClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url: 'http://localhost:3000/trpc' })],
});
// ---cut-end---
const title = client.post.byId.query({ id: '1' }).pipe(
  Effect.catchTag('NOT_FOUND', (err) =>
    Effect.succeed(`no post ${err.data.id}`),
  ),
  Effect.catchTag('TrpcError', (err) => Effect.succeed(err.message)),
);

const call = client.post.byId.query({ id: '1' });
// Doesn't compile: NETWORK_ERROR is tagged TrpcError now
call.pipe(Effect.catchTag('NETWORK_ERROR', () => Effect.succeed(null)));
```

- ✅ `catchTag` means "the error I declared", with no extra check
- ❌ Reverses the human's `error-tags.md` answer, and `catchTag('NETWORK_ERROR')` or `catchTag('BAD_REQUEST')` on built-in codes stops working
- ❌ `_tag` and `code` disagree for built-in errors, on the server too

## Recommendation

**A.** It's Effect's own combinator with tRPC's one rule (`_tag` is the code), and the case it lumps together is rare and already documented. A stale deploy that needs its own handling is a separate question ([`stale-client-error.md`](./stale-client-error.md)), and so is a `reason` inside the code ([`trpc-error-reason.md`](./trpc-error-reason.md)).

## Blocked until answered

- Nothing. B or C would add an export or change `_tag`, and the Effect client docs with them.

## Details

- The Effect client's error union equals the Promise client's since `4066aa3ac`; the type test asserts `catchTag('NOT_FOUND')` leaves no `NOT_FOUND` member.
- `Effect.catchIf(isDefinedError, …)` already catches every declared error and leaves built-in ones, since `isDefinedError` is a refinement. It just can't pick one code.
- From the first-release review, question 14, recommended there as A.
