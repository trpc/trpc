# FiberRef: `FiberRef` → `Context.Reference`

In v4, `FiberRef`, `FiberRefs`, `FiberRefsPatch`, and `Differ` have been removed.
Fiber-local state is now handled by `Context.Reference` — the same mechanism
used for services with default values.

## Built-in References

v3's built-in `FiberRef` values are now `Context.Reference` values exported
from `References` and related modules.

| v3 FiberRef                         | v4 Reference                       |
| ----------------------------------- | ---------------------------------- |
| `FiberRef.currentLogLevel`          | `References.CurrentLogLevel`       |
| `FiberRef.currentMinimumLogLevel`   | `References.MinimumLogLevel`       |
| `FiberRef.currentLogAnnotations`    | `References.CurrentLogAnnotations` |
| `FiberRef.currentLogSpan`           | `References.CurrentLogSpans`       |
| `FiberRef.currentScheduler`         | `References.Scheduler`             |
| `FiberRef.currentMaxOpsBeforeYield` | `References.MaxOpsBeforeYield`     |
| `FiberRef.currentTracerEnabled`     | `References.TracerEnabled`         |
| `FiberRef.unhandledErrorLogLevel`   | `References.UnhandledLogLevel`     |

## Reading References

In v3, `FiberRef.get` retrieved the current value. In v4, references are
services — `yield*` them directly.

**v3**

```ts
import { Effect, FiberRef } from "effect"

const program = Effect.gen(function*() {
  const level = yield* FiberRef.get(FiberRef.currentLogLevel)
  console.log(level)
})
```

**v4**

```ts
import { Effect, References } from "effect"

const program = Effect.gen(function*() {
  const level = yield* References.CurrentLogLevel
  console.log(level) // "Info" (default)
})
```

## Scoped Updates (`Effect.locally` → `Effect.provideService`)

v3's `Effect.locally` set a `FiberRef` value for the duration of an effect. In
v4, use `Effect.provideService` with the reference.

**v3**

```ts
import { Effect, FiberRef, LogLevel } from "effect"

const program = Effect.locally(
  myEffect,
  FiberRef.currentLogLevel,
  LogLevel.Debug
)
```

**v4**

```ts
import { Effect, References } from "effect"

const program = Effect.provideService(
  myEffect,
  References.CurrentLogLevel,
  "Debug"
)
```

## Writing References

v3's `FiberRef.set` mutated the current fiber's ref value. In v4, references are
set via `Effect.provideService`, which scopes the value to the provided effect.

**v3**

```ts
import { Effect, FiberRef } from "effect"

const program = Effect.gen(function*() {
  yield* FiberRef.set(FiberRef.currentMaxOpsBeforeYield, 500)
  // subsequent code sees maxOpsBeforeYield = 500
})
```

**v4**

```ts
import { Effect, References } from "effect"

const program = Effect.provideService(
  Effect.gen(function*() {
    const maxOps = yield* References.MaxOpsBeforeYield
    console.log(maxOps) // 500
  }),
  References.MaxOpsBeforeYield,
  500
)
```
