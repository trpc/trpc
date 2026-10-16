# Effect subtyping changes in v4

In v3, many types were structural subtypes of `Effect`. They carried the
Effect type ID at runtime and could be used anywhere an `Effect` was expected.
This included `Ref`, `Deferred`, `Fiber`, `FiberRef`, `Config`, `Option`,
`Either`, `Context.Tag`, and others.

While convenient, this could cause subtle bugs. For example, passing a `Ref`
to an Effect combinator would read its value instead of treating the ref itself
as a value.

In v4, several of these types are no longer Effect subtypes. Use explicit
conversion or module functions to obtain an Effect. There is no `Yieldable`
trait that makes non-Effect values usable in `Effect.gen`.

## Option and Result require conversion

`Option` and `Result` (the replacement for v3's `Either`) are plain values,
not Effects. They do not have an `.asEffect()` method, and cannot be yielded
directly in `Effect.gen`. Their iterators work with `Option.gen` and
`Result.gen`, respectively, not with `Effect.gen`.

Use `Effect.fromOption` or `Effect.fromResult` in Effect code:

- `Effect.fromOption` succeeds with the contained value for `Some` and fails
  with `Cause.NoSuchElementError` for `None`. An optional `onNone` callback
  supplies a custom error.
- `Effect.fromResult` preserves the success value or failure error.

**v3**: Option is an Effect subtype, so this compiles:

```ts
import { Effect, Option } from "effect"

// Option<number> is assignable to Effect<number, NoSuchElementError>
const program = Effect.map(Option.some(42), (n) => n + 1)
```

**v4**: Convert explicitly, both in combinators and in generators:

```ts
import { Effect, Option, Result } from "effect"

// Effect<number, Cause.NoSuchElementError>
const program = Effect.map(Effect.fromOption(Option.some(42)), (n) => n + 1)

// Effect<number, Cause.NoSuchElementError>
const program2 = Effect.gen(function*() {
  const n = yield* Effect.fromOption(Option.some(42))
  return n + 1
})

// Effect<number, never>
const program3 = Effect.gen(function*() {
  const n = yield* Effect.fromResult(Result.succeed(123))
  return n + 1
})

// Effect<never, string>
const failed = Effect.fromResult(Result.fail("failed"))

// Effect<never, string>
const missing = Effect.fromOption(Option.none(), () => "missing")
```

## Config and services remain Effects

`Config` and `Context.Service` remain Effect subtypes. You can yield them
in `Effect.gen` or pass them directly to Effect combinators without conversion.

```ts
import { Config, Context, Effect } from "effect"

class Greeting extends Context.Service<Greeting, { readonly message: string }>()("Greeting") {}

const program = Effect.gen(function*() {
  const name = yield* Config.String("NAME").pipe(Config.withDefault("world"))
  const greeting = yield* Greeting
  return `${greeting.message}, ${name}!`
}).pipe(Effect.provideService(Greeting, { message: "Hello" }))

const port = Effect.map(Config.Port("PORT").pipe(Config.withDefault(3000)), (n) => n + 1)
```

`Effectable.Class.asEffect()` is a mechanism for defining custom Effects,
not a conversion method available on every iterable value.

## Types no longer subtypes of Effect

Several types that extended `Effect` in v3 no longer do so in v4. Use the
appropriate module functions instead.

**v3**: `Ref` extends `Effect<A>`, yielding the current value:

```ts
import { Effect, Ref } from "effect"

const program = Effect.gen(function*() {
  const ref = yield* Ref.make(0)
  const value = yield* ref // Ref is an Effect<number>
})
```

**v4**: `Ref` is a plain value, use `Ref.get`:

```ts
import { Effect, Ref } from "effect"

const program = Effect.gen(function*() {
  const ref = yield* Ref.make(0)
  const value = yield* Ref.get(ref)
  return value
})
```

**v3**: `Deferred` extends `Effect<A, E>`, resolving when completed:

```ts
import { Deferred, Effect } from "effect"

const program = Effect.gen(function*() {
  const deferred = yield* Deferred.make<string, never>()
  const value = yield* deferred // Deferred is an Effect<string>
})
```

**v4**: `Deferred` is a plain value, use `Deferred.await`:

```ts
import { Deferred, Effect } from "effect"

const program = Effect.gen(function*() {
  const deferred = yield* Deferred.make<string, never>()
  yield* Deferred.succeed(deferred, "done")
  const value = yield* Deferred.await(deferred)
  return value
})
```

**v3**: `Fiber` extends `Effect<A, E>`, joining on yield:

```ts
import { Effect, Fiber } from "effect"

const program = Effect.gen(function*() {
  const fiber = yield* Effect.fork(task)
  const result = yield* fiber // Fiber is an Effect<A, E>
})
```

**v4**: `Fiber` is a plain value, use `Fiber.join`:

```ts
import { Effect, Fiber } from "effect"

const program = Effect.gen(function*() {
  const task = Effect.succeed(42)
  const fiber = yield* Effect.forkChild(task)
  const result = yield* Fiber.join(fiber)
  return result
})
```

## Why this changed

The v3 subtyping approach meant the type system could not distinguish between
"I have a Ref" and "I have an Effect that reads the Ref." For example,
`Effect.all` could accept an array of refs and silently read all of them.

In v4, explicit functions such as `Ref.get`, `Deferred.await`, `Fiber.join`,
`Effect.fromOption`, and `Effect.fromResult` make these operations visible
and prevent those values from being passed accidentally to Effect combinators.
