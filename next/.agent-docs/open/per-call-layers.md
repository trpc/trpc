---
title: "Should a layer also be provided per call, with `.provide(layer, { lifetime: 'call' })`?"
summary: Per-call resources work today with `.provide(Key, acquireRelease)` or `Effect.provide(layer)` in middleware; an option would be sugar.
area: effect
recommended: A
questions: [Q27.2]
links:
  - kind: spike
    label: layered-services
    url: ../../spikes/layered-services/
  - kind: proposal
    label: 27 Layered services and strictness
    url: ../proposals/27-layered-services-and-strictness.md
  - kind: decision
    label: layered-services-and-strictness
    url: ../decisions/layered-services-and-strictness.md
  - kind: note
    label: layered-services spike
    url: ../notes/layered-services-and-strictness.md
  - kind: docs
    label: Effect, Resources
    url: https://v12.trpc.io/v12/docs/server/effect#resources
---

# Should a layer also be provided per call, with `.provide(layer, { lifetime: 'call' })`?

## Why it matters

Some services live for one call: a transaction, a request-scoped logger. If `.provide(layer)` ships built once per runtime ([`provide-layer.md`](./provide-layer.md)), the question is whether the same method also takes a per-call lifetime. Effect itself builds layers once and provides per-request services through middleware; nothing in Effect builds a layer per request except a middleware calling `Effect.provide(layer)`.

## Options

### A) Keep it as it is: per-call services through `.provide()` or middleware

Each Effect step of a query or mutation has a `Scope`, so a `.provide()` factory can acquire and release; an Effect middleware can provide a whole layer per call.

```ts
const inTx = t.procedure.provide(Tx, () =>
  Effect.acquireRelease(db.begin, (_, exit) =>
    Exit.isSuccess(exit) ? db.commit : db.rollback,
  ),
);

// or a whole layer, per call, reusing what the runtime built (Db)
const withTx = t.procedure.use(
  t.middleware.effect<{ provides: Tx }>()((opts) =>
    opts.next().pipe(Effect.provide(Tx.layer)),
  ),
);
```

- ✅ Built, documented ("Resources") and tested; `.provide()` keeps meaning "per call"
- ✅ `Effect.provide(layer)` forks the runtime's memo map, so the call reuses `Db` and releases only its own part
- ❌ Two ways to write it, and the middleware form is more to type than an option

### B) `.provide(layer, { lifetime: 'call' })`

```ts
const withTx = t.procedure.provide(Tx.layer, { lifetime: 'call' });

const create = withTx.mutation(() =>
  Effect.flatMap(Tx, (tx) => tx.insert('Hello')),
);
```

- ✅ One method for both lifetimes, and shorter than the middleware
- ❌ A third meaning for `.provide()`, beside per-call `(Key, make)` and once-per-runtime `(layer)`
- ❌ The call's scope ends with the resolver's `Effect`, before a streamed output is read, so it can't hold a streamed procedure's resources until that's fixed

## Recommendation

**A.** Per-call resources already work in the Effect way, and a lifetime option adds a third reading of `.provide()` for little. Revisit if streamed outputs get a call scope that spans the stream.

## Blocked until answered

- Nothing; the "Resources" docs describe A.

## Details

The spike's `provideLayer(builder, layer, { lifetime: 'call' })` ran `tx 1 begin`, `tx 1 end`, `tx 2 begin`, `tx 2 end` with `db open` once. A per-call layer may only fail with a `TrpcError`, which joins the procedure's errors (a layer failing with `Error` is a compile error, per Q2.3).
