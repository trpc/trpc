# Layer Memoization

In v3, each call to `Effect.provide` created its own memoization scope. Layers
were memoized / deduplicated within a single `Effect.provide` call, but would
**not** be shared across separate calls — so two `Effect.provide` calls with
overlapping layers would silently build those layers twice.

In v4, a layer already built by an enclosing `Effect.provide` or runtime is
reused by nested `Effect.provide` calls. Each call forks the ambient `MemoMap`: it
can reuse parent entries, but newly built layers are not written back to the
parent. Sibling `Effect.provide` calls therefore build their own copies, just as
in v3. Use `{ local: true }` to build a fresh layer subtree without reusing the
enclosing memo map.

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

// Same layer provided twice in nested provide calls
const main = program.pipe(
  Effect.provide(MyServiceLayer),
  Effect.provide(MyServiceLayer)
)

// Effect v3: "Building MyService" is logged TWICE
// Effect v4: "Building MyService" is logged ONCE
Effect.runPromise(main)
```

The calls above are nested, not siblings. In contrast, the following builds
`MyServiceLayer` twice in v4 when no enclosing provide or runtime has already
built it:

```ts
const siblings = Effect.gen(function*() {
  yield* program.pipe(Effect.provide(MyServiceLayer))
  yield* program.pipe(Effect.provide(MyServiceLayer))
})

Effect.runPromise(siblings) // "Building MyService" is logged TWICE
```

## Prefer Layer Composition Over Multiple Provides

Even though nested v4 `provide` calls reuse already-built layers, **composing
layers before providing is still the recommended pattern**. Layer composition makes your
dependency graph explicit and lets you see the full structure in one place:

```ts
// Preferred — provide once
const main = program.pipe(Effect.provide(MyServiceLayer))
```

Reusing enclosing layers is **not** a substitute for proper layer composition
and does not deduplicate independent sibling builds.

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
fiber's ambient one. The layer and all its sublayers are built from scratch,
without reusing layers built by an enclosing `provide` or runtime. Nested
`provide` calls can still reuse layers built in this local map.

```ts
import { Effect } from "effect"

const main = program.pipe(
  Effect.provide(MyServiceLayer, { local: true }),
  Effect.provide(MyServiceLayer)
)
// "Building MyService" is logged TWICE — local creates its own memo map
```

Use `local: true` when you need an entire layer subtree to be isolated — for
example, when providing layers in a test harness where each test should get
independent resources.
