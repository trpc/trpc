# Runtime: `Runtime<R>` Removed

In v3, `Runtime<R>` bundled a `Context<R>`, `RuntimeFlags`, and `FiberRefs`
into a single value used to execute effects:

```ts
// v3
interface Runtime<in R> {
  readonly context: Context.Context<R>
  readonly runtimeFlags: RuntimeFlags
  readonly fiberRefs: FiberRefs
}
```

In v4, this type no longer exists and you can use `Context<R>` instead.
Run functions live directly on `Effect`, and the `Runtime` module is reduced to
process lifecycle utilities.

## `Runtime.runFork(runtime)` -> `Effect.runForkWith(services)`

In v3, running an effect with dependencies usually meant pulling the current
runtime from `Effect.runtime<R>()` and calling `Runtime.runFork(runtime)` inside
the main effect.

**v3**

```ts
import { Context, Effect, Runtime } from "effect"

class Logger extends Context.Tag("Logger")<Logger, {
  readonly log: (message: string) => void
}>() {}

const program = Effect.gen(function*() {
  const logger = yield* Logger
  logger.log("Hello from Logger")
})

const main = Effect.gen(function*() {
  const runtime = yield* Effect.runtime<Logger>()
  return Runtime.runFork(runtime)(program)
}).pipe(
  Effect.provideService(Logger, {
    log: (message) => console.log(message)
  })
)

const fiber = Effect.runFork(main)
```

In v4, use the same pattern with `Effect.context<R>()`, then run with
`Effect.runForkWith(services)`:

**v4**

```ts
import { Context, Effect } from "effect"

class Logger extends Context.Service<Logger, {
  readonly log: (message: string) => void
}>()("Logger") {}

const program = Effect.gen(function*() {
  const logger = yield* Logger
  logger.log("Hello from Logger")
})

const main = Effect.gen(function*() {
  const services = yield* Effect.context<Logger>()
  return Effect.runForkWith(services)(program)
}).pipe(
  Effect.provideContext(Context.make(Logger, {
    log: (message) => console.log(message)
  }))
)

const fiber = Effect.runFork(main)
```

If your effect has no service requirements, use `Effect.runFork(effect)`.

## `Runtime` Module Contents

The `Runtime` module now only contains:

- `Teardown` — interface for handling process exit
- `defaultTeardown` — default teardown implementation
- `makeRunMain` — creates platform-specific main runners
