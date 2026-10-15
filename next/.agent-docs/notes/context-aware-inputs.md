# Context-aware inputs (05 (d))

- **Date:** 2026-10-09
- **Question:** If `.input()` accepts only Standard Schema and Effect Schema, plus a callback `({ ctx }) => schema` that returns either, what does it cost? Is there a way for a validator to read `ctx` without a callback?
- **Feeds:** [05 — Validation](../proposals/05-validation-and-schemas.md) (Q5.1, new Q5.6), [validation](../decisions/validation.md).
- **Code:** [`next/spikes/context-aware-input/`](../../spikes/context-aware-input/).
  - `core.ts` is a small runtime builder that runs each call as an Effect, with a fiber hop between steps. Middleware is simplified to "return a ctx extension", and `provideService` stands in for 06 (g)'s service-providing Effect middleware. It is not an API proposal.
  - `context-aware-input.test.ts` (16 runtime tests) and `.test-d.ts` (12 type tests) run in `pnpm test`.
  - `bench.ts` measures per-call cost: `node context-aware-input/bench.ts [iterations]`.
- **Versions:** zod 4.6.5, arktype 2.2.8, effect 4.0.2, TypeScript 7.0.2, Node 24.21.0, 4 vCPUs.

## Three ways to make validation ctx-aware

```ts
// A. callback: the schema is built from ctx
authed.input(({ ctx }) =>
  z.object({ limit: z.number().max(ctx.user.isPro ? 1000 : 100) }),
);

// B. AsyncLocalStorage: a static schema whose refinement reads ctx
const Limit = z.object({
  limit: z
    .number()
    .refine((n) => n <= (authed.inputContext().ctx.user.isPro ? 1000 : 100)),
});
authed.input(Limit);

// C. Effect Schema services: a static schema whose check needs a service
const Limit = Schema.Struct({
  limit: Schema.Number.pipe(
    Schema.decode({
      decode: SchemaGetter.checkEffect((n: number) =>
        CurrentUser.use((user) =>
          Effect.succeed(n <= (user.isPro ? 1000 : 100)),
        ),
      ),
      encode: SchemaGetter.passthrough(),
    }),
  ),
});
authed.provideService(CurrentUser, (ctx) => ctx.user).input(Limit); // type error without the provide
```

All three work at runtime and in types. The callback's `ctx` is the ctx at that point in the chain: middleware before `.input()` is visible, middleware after it is not. B's store and C's services follow the same rule.

## Cost per call

Median of three runs, 100k iterations. The "validate" rows measure only validation. The "call" rows measure the spike's whole pipeline (Effect fiber, middleware, validation, resolver).

| Case                                         | µs/op |
| -------------------------------------------- | ----: |
| validate: static zod                         |  0.19 |
| validate: callback zod, rebuilt every call   |  37.1 |
| validate: callback zod, memoized by plan     |  0.14 |
| validate: AsyncLocalStorage refine zod       |  0.30 |
| validate: static Effect Schema               |  0.25 |
| validate: callback Effect Schema, rebuilt    |  7.32 |
| validate: Effect Schema with a service check |  2.19 |
| call: static zod                             |  4.76 |
| call: callback zod, rebuilt                  |  42.0 |
| call: AsyncLocalStorage refine zod           |  4.26 |
| call: Effect Schema with a service check     |  7.53 |

Rebuilding a Zod object schema costs about 15 µs to construct and 13–19 µs for Zod 4's per-schema JIT compile; `jitless` brings construct-plus-validate to about 21 µs. Rebuilding therefore costs about 8× the whole rest of the call. Picking from schemas built ahead of time (`byPlan[ctx.user.plan]`) costs nothing, but that is the user's job: the framework can't cache a callback's result.

## A. Callback: downsides

1. **Speed**, as above: users must know not to build schemas inside the callback.
2. **Nothing static to look at.** OpenAPI (18), runtime contracts (09), client-side validation and anything else that introspects a procedure gets `'callback'` instead of a schema. The callback can't be called without a real `ctx`. Chaining a static `.input()` for the shape before the callback gives generators something, but every chained schema re-validates the raw input.
3. **Types are only right when the shape is the same for every ctx.** `ctx.user.isPro ? z.object({ limit, export }) : z.object({ limit })` infers `{ limit: number }`: TypeScript subtype-reduces the two `ZodObject`s before tRPC sees them, and `export` is silently dropped from the client's input type. Only constraints (max, enum members, refinements) can safely depend on ctx.
4. **Telling a callback from a schema.** Effect `Schema.Class` and ArkType types are functions. The runtime check must be "a function, and not `Schema.isSchema`, and no `~standard`". At the type level, `.input()` needs two overloads, because a contextually typed callback defers inference and falls back to the constraint. With overloads TypeScript reports only the last one's error, so either static schemas or callbacks get the unhelpful message. The spike puts static schemas last: a missing Effect service names `CurrentUser`, while a callback that returns a non-schema only says it is not assignable to `AnySchema`.
5. **Two failure kinds.** A throwing callback is a server bug (500), not `BAD_REQUEST`. Validation errors from the returned schema are `BAD_REQUEST`.
6. **Async callbacks** (look up something to build the schema) aren't in the spike. They would add a round trip before validation, which middleware already does better.

## Without a callback

### B. AsyncLocalStorage inside the schema

tRPC wraps each `~standard.validate()` call in `store.run({ ctx, meta, path }, …)`. Any library's refinement, transform or check can then read `ctx` through an accessor. There's no other channel: Standard Schema's `validate(value, options?)` has `libraryOptions`, but Zod 4.6.5's `validate` takes only the value, and Zod's `parse` context carries no user data.

- ✅ The schema stays static, so JSON Schema works (the ctx-dependent limit is invisible to it, as with A).
- ✅ Cheap: +0.1 µs per validate. Async refinements keep their own ctx under 50 concurrent calls with random delays, including across Effect fiber hops: Effect 4 captures an `AsyncResource` per fiber when `node:async_hooks` exists.
- ❌ **Not type-safe.** The accessor can be typed by the builder it is called on (`authed.inputContext()`), but nothing ties the schema to that builder. `t.procedure.input(z.object({ limit: NeedsUser }))` compiles and fails at runtime.
- ❌ **Shared schemas break outside tRPC.** The same schema used in a client form or a unit test throws `inputContext() called outside tRPC input validation`.
- ❌ **Runtime support.** `AsyncLocalStorage` is in Node, Bun, Deno and Workers (with `nodejs_compat`), but not in the WinterTC minimum common API that 12's adapters assume. TC39 `AsyncContext` would fix this later.
- ❌ **Zod runs refinements twice through Standard Schema when any refinement is async.** `~standard.validate` first tries synchronously, hits the async refinement, throws internally and reruns everything asynchronously: 2 calls each in the test, compared with 1 for `parseAsync`. A ctx-aware check that hits the database runs twice. This affects every async Zod refinement, with or without B, and it is a Zod issue that tRPC can't fix without vendor-specific code.

### C. Effect Schema services

Effect Schema checks can require services (`SchemaGetter.checkEffect` returning `Effect<…, never, CurrentUser>`). The requirement is part of the schema's type (`DecodingServices`), so `.input()` can check it against the services provided earlier in the chain.

- ✅ **Typed end to end.** Forgetting to provide the service is a type error on `.input()` that names the service, both for static schemas and for schemas returned from a callback.
- ✅ The schema stays static: `Schema.toJsonSchemaDocument` works.
- ✅ Using the schema outside tRPC (for example on the client) is a type error, not a runtime throw.
- ❌ **Effect only.** It needs native Effect Schema support (Q5.1 V-A), because `Schema.toStandardSchemaV1` only accepts schemas with no services. It also needs service-providing middleware in v1 (Q6.6).
- ❌ Slower than a plain check: 2.2 µs vs 0.25 µs per validate. That is still small next to the pipeline.

## Summary

|                                    |   A. Callback   | B. AsyncLocalStorage |  C. Effect services  |
| ---------------------------------- | :-------------: | :------------------: | :------------------: |
| Any Standard Schema library        |       ✅        |          ✅          |          ❌          |
| Typed `ctx`                        |       ✅        |     ⚠️ unchecked     |          ✅          |
| Static schema (OpenAPI, contracts) |       ❌        |          ✅          |          ✅          |
| Cost                               | ❌ when rebuilt |          ✅          |          ✅          |
| Schema reusable outside tRPC       |       ✅        |      ❌ throws       | ⚠️ needs the service |
| All runtimes                       |       ✅        |          ❌          |          ✅          |

A and C fit together: the callback for Standard Schema users, services for Effect users, and the same `.input()` type check for both. B buys "no callback" with unchecked types and runtime throws. The baseline with no new API is still a middleware after `.input()` that checks the parsed input against `ctx`.
