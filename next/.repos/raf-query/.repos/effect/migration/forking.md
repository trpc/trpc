# Forking: Renamed Combinators and New Options

The `fork*` family of combinators has been renamed in v4 for clarity, and all
variants now accept an options object for controlling fiber startup behavior.

## Renamings

| v3                            | v4                  | Description                                  |
| ----------------------------- | ------------------- | -------------------------------------------- |
| `Effect.fork`                 | `Effect.forkChild`  | Fork as a child of the current fiber         |
| `Effect.forkDaemon`           | `Effect.forkDetach` | Fork detached from parent lifecycle          |
| `Effect.forkScoped`           | `Effect.forkScoped` | Fork tied to the current `Scope` (unchanged) |
| `Effect.forkIn`               | `Effect.forkIn`     | Fork in a specific `Scope` (unchanged)       |
| `Effect.forkAll`              | —                   | Removed                                      |
| `Effect.forkWithErrorHandler` | —                   | Removed                                      |

## `Effect.fork` → `Effect.forkChild`

**v3**

```ts
import { Effect } from "effect"

const fiber = Effect.fork(myEffect)
```

**v4**

```ts
import { Effect } from "effect"

const fiber = Effect.forkChild(myEffect)
```

## `Effect.forkDaemon` → `Effect.forkDetach`

**v3**

```ts
import { Effect } from "effect"

const fiber = Effect.forkDaemon(myEffect)
```

**v4**

```ts
import { Effect } from "effect"

const fiber = Effect.forkDetach(myEffect)
```

## Fork Options

In v4, `forkChild`, `forkDetach`, `forkScoped`, and `forkIn` all accept an
optional options object with the following fields:

```ts
{
  readonly startImmediately?: boolean | undefined
  readonly uninterruptible?: boolean | "inherit" | undefined
}
```

- **`startImmediately`** — When `true`, the forked fiber begins executing
  immediately rather than being deferred. Defaults to `undefined` (deferred).
- **`uninterruptible`** — Controls whether the forked fiber can be interrupted.
  `true` makes it uninterruptible, `"inherit"` inherits the parent's
  interruptibility, and `undefined` uses the default behavior.

**Usage as data-last (curried)**

```ts
import { Effect } from "effect"

const fiber = myEffect.pipe(
  Effect.forkChild({ startImmediately: true })
)
```

**Usage as data-first**

```ts
import { Effect } from "effect"

const fiber = Effect.forkChild(myEffect, { startImmediately: true })
```

## Removed Combinators

**`Effect.forkAll`** and **`Effect.forkWithErrorHandler`** have been removed in
v4. For `forkAll`, fork effects individually with `forkChild` or use
higher-level concurrency combinators. For error handling on forked fibers,
observe the fiber's result via `Fiber.join` or `Fiber.await`.
