---
title: What should `call()` on a subscription resolve to?
summary: '`call()` on a subscription resolves to an Effect `Stream` though it is typed as one event; type it as a `Stream`, or return an `AsyncIterable` of events.'
area: server
recommended: B
links:
  - kind: decision
    label: router-client-runtime
    url: ../decisions/router-client-runtime.md
  - kind: docs
    label: Server-side calls
    url: https://v12.trpc.io/v12/docs/server/server-side-calls
  - kind: code
    label: call()
    url: ../../packages/trpc/src/server/caller.ts
  - kind: code
    label: callProcedure (a subscription succeeds with a Stream)
    url: ../../packages/trpc/src/server/execution/execute.ts
---

# What should `call()` on a subscription resolve to?

## Why it matters

`call(procedure, input, opts)` runs one procedure in-process and resolves to its output, typed `TDef['output']`. For a subscription that type is one event, but the value is the Effect `Stream` that `callProcedure` returns: checked on `v12`, `await call(onTick, undefined)` is an object with a `channel` field and no `Symbol.asyncIterator`. Code that trusts the type breaks at runtime. A streamed query through `call()` already resolves to an `AsyncIterable`, and the router client's `subscribe()` returns one.

## Options

### A) Type it as what it returns: a `Stream`

`call()` on a subscription resolves to `Stream<Event, Errors>`, and the type says so.

```ts
const onTick = t.procedure.subscription(async function* () {
  yield 1;
  yield 2;
});

// before: typed number, actually a Stream
const ticks = await call(onTick, undefined);
// after: typed Stream<number, …>
await Effect.runPromise(Stream.runForEach(ticks, (tick) => Effect.log(tick)));
```

- ✅ No runtime change, and Effect users get a `Stream` to compose
- ❌ A Promise user must import `effect` to read a subscription, in tests and scripts that call procedures directly
- ❌ Unlike a streamed query through `call()`, and the router client's `subscribe()`

### B) Return an `AsyncIterable` of events

`call()` turns the subscription's `Stream` into an `AsyncIterable` of events, typed so, as it does for a streamed query and as the router client does.

```ts
// before: typed number, actually a Stream
// after:
for await (const tick of await call(onTick, undefined)) {
  console.log(tick); // number
}

// Effect code gets the Stream from callProcedure (@trpc12/trpc/extend)
const ticksEffect = callProcedure({
  procedure: onTick,
  path: '',
  ctx: {},
  input: undefined,
  signal,
}); // Effect<unknown>: a Stream for a subscription
```

- ✅ The type is the value, with no `effect` import, as for every other `call()` output
- ✅ Matches `createRouterClient(router).onTick.subscribe()` and streamed queries
- ❌ Effect users lose the `Stream` from `call()`; `callProcedure` in `@trpc12/trpc/extend` still returns one, but untyped (`Effect<unknown>`)
- ❌ A failure becomes what the iterator throws, with no error type, as for a streamed query through `call()`

## Recommendation

**B.** `call()` is a Promise API that tests and scripts use without Effect, and server-side calls are where non-Effect users realistically touch it ([`effect-first-public-apis.md`](../decisions/effect-first-public-apis.md)). Every other `call()` output, and the router client, already gives an `AsyncIterable`. Effect code has `callProcedure`.

## Blocked until answered

- Nothing is blocked; the server-side calls page doesn't show a subscription through `call()`.

## Details

- One question in three places: the first-release review ("`call()` on a subscription returns an Effect `Stream`, though its type says the event type", recommended: an `AsyncIterable` of events), the `Open:` bullet in [`router-client-runtime.md`](../decisions/router-client-runtime.md), and the execution worker's second-pass report.
- With `{ layer }`, the layer is released when `call()` resolves, before the events are read; the docs already say to pass a `runtime` when the output streams. That holds under both options.
