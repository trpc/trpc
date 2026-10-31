# Error Handling: `catch*` Renamings

The `catch` combinators on `Effect` have been renamed in v4. The general
pattern: `catchAll*` is shortened to `catch*`, and the `catchSome*` family is
replaced by `catchFilter` / `catchCauseFilter`.

## Renamings

| v3                       | v4                             |
| ------------------------ | ------------------------------ |
| `Effect.catchAll`        | `Effect.catch`                 |
| `Effect.catchAllCause`   | `Effect.catchCause`            |
| `Effect.catchAllDefect`  | `Effect.catchDefect`           |
| `Effect.catchTag`        | `Effect.catchTag` (unchanged)  |
| `Effect.catchTags`       | `Effect.catchTags` (unchanged) |
| `Effect.catchIf`         | `Effect.catchIf` (unchanged)   |
| `Effect.catchSome`       | `Effect.catchFilter`           |
| `Effect.catchSomeCause`  | `Effect.catchCauseFilter`      |
| `Effect.catchSomeDefect` | Removed                        |

## `Effect.catchAll` → `Effect.catch`

**v3**

```ts
import { Effect } from "effect"

const program = Effect.fail("error").pipe(
  Effect.catchAll((error) => Effect.succeed(`recovered: ${error}`))
)
```

**v4**

```ts
import { Effect } from "effect"

const program = Effect.fail("error").pipe(
  Effect.catch((error) => Effect.succeed(`recovered: ${error}`))
)
```

## `Effect.catchAllCause` → `Effect.catchCause`

**v3**

```ts
import { Effect } from "effect"

const program = Effect.die("defect").pipe(
  Effect.catchAllCause((cause) => Effect.succeed("recovered"))
)
```

**v4**

```ts
import { Cause, Effect } from "effect"

const program = Effect.die("defect").pipe(
  Effect.catchCause((cause) => Effect.succeed("recovered"))
)
```

## `Effect.catchSome` → `Effect.catchFilter`

In v3, `catchSome` took a function returning `Option<Effect>`. In v4,
`catchFilter` uses the `Filter` module instead.

**v3**

```ts
import { Effect, Option } from "effect"

const program = Effect.fail(42).pipe(
  Effect.catchSome((error) =>
    error === 42
      ? Option.some(Effect.succeed("caught"))
      : Option.none()
  )
)
```

**v4**

```ts
import { Effect, Filter } from "effect"

const program = Effect.fail(42).pipe(
  Effect.catchFilter(
    Filter.fromPredicate((error: number) => error === 42),
    (error) => Effect.succeed("caught")
  )
)
```

## Defects take precedence in mixed causes

A failure cause can hold a typed error and a defect at the same time, for
example when a finalizer dies after the effect has already failed. In v4,
every operator that recovers from typed errors skips such causes. The handler
does not run, and the failure is propagated with each typed error converted to
a defect.

In v3 only some operators behaved this way (`catchAll`, `matchEffect`,
`match`, `orElse`, `orElseSucceed`, `ignore`, `either`, `option` and
`Effect.retry`). `catchTag`, `catchTags`, `catchIf`, `catchSome` and the
`Stream` and `Channel` recovery operators ran the handler and dropped the
defect. In v4 the rule is the same for all of them:

- `Effect`: `catch`, `catchTag`, `catchTags`, `catchIf`, `catchFilter`,
  `catchReason`, `catchReasons`, `catchEager`, `matchEffect`, `match`,
  `matchEager`, `orElseSucceed`, `ignore`, `option`, `result`, `orDie`,
  `eventually`, `firstSuccessOf`, `retry`, `retryOrElse`, `repeat` and
  `repeatOrElse`
- `Stream` and `Channel`: their typed recovery operators, including `catch`,
  `catchTag`, `catchIf`, `catchFilter`, `catchReason`, `catchReasons`,
  `ignore`, `orDie` and `retry`

An interruption alongside a typed error does not prevent recovery. The first
typed error is handled; other typed errors and interrupts can be discarded.

```ts
import { Effect } from "effect"

const program = Effect.fail("error").pipe(
  Effect.ensuring(Effect.die("finalizer defect")),
  // The handler does not run: the cause contains a defect
  Effect.catch(() => Effect.succeed("recovered"))
)
// fails with Die("error") + Die("finalizer defect")
```

Use `Effect.catchDefect` or `Effect.catchCause` to recover from causes that
contain defects.

### Retry and repeat error paths

`Effect.retry`, `retryOrElse`, `repeat` and `repeatOrElse` apply this rule to
source failures. `Fail(e) + Interrupt` now enters the typed error path instead
of propagating unchanged. `retry` retries it; when retries run out, or `repeat`
re-raises it, the final cause is `Fail(e)` without the interrupt. The `orElse`
handlers can now receive `e` from these causes.

`repeat` and `repeatOrElse` also apply the rule to policy failures. A policy
failure containing `Fail(e) + Die(d)` propagates as `Die(e) + Die(d)` without
running `orElse`. In contrast, `retry` and `retryOrElse` do not recover policy
errors, so policy failures keep their original cause.

## Error mapping preserves the whole cause

Error mapping is not recovery. `Effect.mapError`, `mapErrorEager`, `mapBoth`
and `mapBothEager`, `Exit.mapError` and `mapBoth`, `Stream.mapError` and
`mapBoth`, and `Channel.mapError` now map every typed error in place while
preserving defects, interrupts and reason order. Eager and suspended inputs
follow the same rule. For example, `Fail(e) + Interrupt + Die(d)` becomes
`Fail(f(e)) + Interrupt + Die(d)`, not an elected defect cause.

Previously these operators mapped only the first typed error and discarded
the remaining reasons. If a cause contains several typed errors, the mapper
now runs for each one. Unlike typed recovery, mapping neither skips errors
beside defects nor converts them to defects.

## New in v4

- **`Effect.catchReason(errorTag, reasonTag, handler)`** — catches a specific
  `reason` within a tagged error without removing the parent error from the
  error channel. Useful for handling nested error causes (e.g. an `AiError`
  with a `reason: RateLimitError | QuotaExceededError`).
- **`Effect.catchReasons(errorTag, cases)`** — like `catchReason` but handles
  multiple reason tags at once via an object of handlers.
- **`Effect.catchEager(handler)`** — an optimization variant of `catch` that
  evaluates synchronous recovery effects immediately.
