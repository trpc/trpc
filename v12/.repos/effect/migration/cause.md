# Cause: Flattened Structure

In v3, `Cause<E>` was a recursive tree with six variants:

```
Empty | Fail<E> | Die | Interrupt | Sequential<E> | Parallel<E>
```

The `Sequential` and `Parallel` variants composed causes into a tree to
represent errors from finalizers or concurrent operations.

In v4, `Cause<E>` has been flattened to a simple wrapper around an array of
`Reason` values:

```ts
interface Cause<E> {
  readonly reasons: ReadonlyArray<Reason<E>>
}

type Reason<E> = Fail<E> | Die | Interrupt
```

There are only three reason variants — `Fail`, `Die`, and `Interrupt`. The
`Empty`, `Sequential`, and `Parallel` variants have been removed. An empty
cause is represented by an empty `reasons` array. Multiple failures (from
concurrent or sequential composition) are collected into a flat array.

## Accessing Reasons

**v3** — pattern match on the recursive tree structure:

```ts
import { Cause } from "effect"

const handle = (cause: Cause.Cause<string>) => {
  switch (cause._tag) {
    case "Fail":
      return cause.error
    case "Die":
      return cause.defect
    case "Empty":
      return undefined
    case "Sequential":
      return handle(cause.left)
    case "Parallel":
      return handle(cause.left)
    case "Interrupt":
      return cause.fiberId
  }
}
```

**v4** — iterate over the flat `reasons` array:

```ts
import { Cause } from "effect"

const handle = (cause: Cause.Cause<string>) => {
  for (const reason of cause.reasons) {
    switch (reason._tag) {
      case "Fail":
        return reason.error
      case "Die":
        return reason.defect
      case "Interrupt":
        return reason.fiberId
    }
  }
}
```

## Reason Guards

The v3 type-level guards (`isFailType`, `isDieType`, `isInterruptType`, etc.)
have been replaced by reason-level guards:

| v3                              | v4                                |
| ------------------------------- | --------------------------------- |
| `Cause.isEmptyType(cause)`      | `cause.reasons.length === 0`      |
| `Cause.isFailType(cause)`       | `Cause.isFailReason(reason)`      |
| `Cause.isDieType(cause)`        | `Cause.isDieReason(reason)`       |
| `Cause.isInterruptType(cause)`  | `Cause.isInterruptReason(reason)` |
| `Cause.isSequentialType(cause)` | Removed                           |
| `Cause.isParallelType(cause)`   | Removed                           |

## Cause-Level Predicates

| v3                               | v4                               |
| -------------------------------- | -------------------------------- |
| `Cause.isFailure(cause)`         | `Cause.hasFails(cause)`          |
| `Cause.isDie(cause)`             | `Cause.hasDies(cause)`           |
| `Cause.isInterrupted(cause)`     | `Cause.hasInterrupts(cause)`     |
| `Cause.isInterruptedOnly(cause)` | `Cause.hasInterruptsOnly(cause)` |

## Constructors

| v3                              | v4                           |
| ------------------------------- | ---------------------------- |
| `Cause.empty`                   | `Cause.empty`                |
| `Cause.fail(error)`             | `Cause.fail(error)`          |
| `Cause.die(defect)`             | `Cause.die(defect)`          |
| `Cause.interrupt(fiberId)`      | `Cause.interrupt(fiberId)`   |
| `Cause.sequential(left, right)` | `Cause.combine(left, right)` |
| `Cause.parallel(left, right)`   | `Cause.combine(left, right)` |

In v4, `Cause.combine` concatenates the `reasons` arrays of two causes. The
distinction between sequential and parallel composition is no longer
represented in the data structure.

## Extractors

| v3                             | v4                                         |
| ------------------------------ | ------------------------------------------ |
| `Cause.failureOption(cause)`   | `Cause.findErrorOption(cause)`             |
| `Cause.failureOrCause(cause)`  | `Cause.findError(cause)`                   |
| `Cause.dieOption(cause)`       | `Cause.findDefect(cause)`                  |
| `Cause.interruptOption(cause)` | `Cause.findInterrupt(cause)`               |
| `Cause.failures(cause)`        | `cause.reasons.filter(Cause.isFailReason)` |
| `Cause.defects(cause)`         | `cause.reasons.filter(Cause.isDieReason)`  |
| `Cause.interruptors(cause)`    | `Cause.interruptors(cause)`                |

Note: `findError` and `findDefect` return `Result.Result` instead of `Option`.
Use `findErrorOption` for the `Option`-based variant.

## Error Classes

All `*Exception` classes have been renamed to `*Error`:

| v3                                     | v4                            |
| -------------------------------------- | ----------------------------- |
| `Cause.NoSuchElementException`         | `Cause.NoSuchElementError`    |
| `Cause.TimeoutException`               | `Cause.TimeoutError`          |
| `Cause.IllegalArgumentException`       | `Cause.IllegalArgumentError`  |
| `Cause.ExceededCapacityException`      | `Cause.ExceededCapacityError` |
| `Cause.UnknownException`               | `Cause.UnknownError`          |
| `Cause.RuntimeException`               | Removed                       |
| `Cause.InterruptedException`           | Removed                       |
| `Cause.InvalidPubSubCapacityException` | Removed                       |

The corresponding guards follow the same pattern:

| v3                                     | v4                                 |
| -------------------------------------- | ---------------------------------- |
| `Cause.isNoSuchElementException(u)`    | `Cause.isNoSuchElementError(u)`    |
| `Cause.isTimeoutException(u)`          | `Cause.isTimeoutError(u)`          |
| `Cause.isIllegalArgumentException(u)`  | `Cause.isIllegalArgumentError(u)`  |
| `Cause.isExceededCapacityException(u)` | `Cause.isExceededCapacityError(u)` |
| `Cause.isUnknownException(u)`          | `Cause.isUnknownError(u)`          |

## New in v4

- **`Cause.fromReasons(reasons)`** — construct a `Cause` from an array of
  `Reason` values.
- **`Cause.makeFailReason(error)`**, **`Cause.makeDieReason(defect)`**,
  **`Cause.makeInterruptReason(fiberId)`** — construct individual `Reason`
  values.
- **`Cause.annotate(cause, annotations)`** — attach annotations to a `Cause`.
- **`Cause.findFail(cause)`**, **`Cause.findDie(cause)`**,
  **`Cause.findInterrupt(cause)`** — extract specific reason types using
  the `Result` module.
- **`Cause.filterInterruptors(cause)`** — extract interrupting fiber IDs as
  a `Result`.
- **`Cause.Done`** — a graceful completion signal for queues and streams.
