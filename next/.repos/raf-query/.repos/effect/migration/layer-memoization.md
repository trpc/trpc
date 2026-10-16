# Layer Memoization

In v3, each call to `Effect.provide` created its own memoization scope. Layers
were memoized / deduplicated within a single `Effect.provide` call, but would
**not** be shared across separate calls — so two `Effect.provide` calls with
overlapping layers would silently build those layers twice.

In v4, the underlying `MemoMap` data structure which facilitates memoization of
`Layer`s is shared between `Effect.provide` calls (unless explicitly disabled
via the `{ local: true }` option). Thus, layers are automatically memoized /
deduplicated across `Effect.provide` calls.

## Example

```ts
import { Console, Context, Effect, Layer } from "effect"

const MyService = Context.Service<{ readonly value: string }>("MyService")

const MyServiceLayer = Layer.effect(
  MyService,
  Effect.gen(function*() {
    yield* Console.log("Building MyService")
    return { value: "hello" }
  })
)

const program = Effect.gen(function*() {
  const a = yield* MyService
  return a.value
})

// Same layer provided twice in separate provide calls
const main = program.pipe(
  Effect.provide(MyServiceLayer),
  Effect.provide(MyServiceLayer)
)

// Effect v3: "Building MyService" is logged TWICE
// Effect v4: "Building MyService" is logged ONCE
Effect.runPromise(main)
```

## Prefer Layer Composition Over Multipl Provides

Even though v4 memoizes across `provide` calls, **composing layers before
providing is still the recommended pattern**. Layer composition makes your
dependency graph explicit and lets you see the full structure in one place:

```ts
// Preferred — provide once
const main = program.pipe(Effect.provide(MyServiceLayer))
```

The auto-memoization feature is a safety net to avoid the footguns associated
with multiple `Effect.provide` calls present in v3. It is **NOT** a substitute
for proper layer composition.

## Opting Out of Shared Memoization

There are cases where you **want** a layer to be built fresh — for example,
test isolation or creating independent resource pools. v4 provides two
mechanisms:

### `Layer.fresh`

Wraps a layer so it always builds with a fresh memo map, bypassing the shared
cache. This existed in v3 as well.

```ts
import { Effect, Layer } from "effect"

const main = program.pipe(
  Effect.provide(MyServiceLayer),
  Effect.provide(Layer.fresh(MyServiceLayer))
)
// "Building MyService" is logged TWICE — fresh bypasses the shared cache
```

### `Effect.provide` with `{ local: true }`

New in v4. Builds the provided layer with a **local memo map** instead of the
fiber's shared one. The layer and all its sublayers are built from scratch and
are not shared with other `provide` calls.

```ts
import { Effect } from "effect"

const main = program.pipe(
  Effect.provide(MyServiceLayer),
  Effect.provide(MyServiceLayer, { local: true })
)
// "Building MyService" is logged TWICE — local creates its own memo map
```

Use `local: true` when you need an entire layer subtree to be isolated — for
example, when providing layers in a test harness where each test should get
independent resources.
