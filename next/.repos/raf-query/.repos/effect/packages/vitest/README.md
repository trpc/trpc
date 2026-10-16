# @effect/vitest

Helpers for testing Effect-based code with [Vitest](https://vitest.dev). Provides an enhanced `it` function with support for scoped tests, test services such as `TestClock`, shared layers, and property testing.

## Installation

Install Vitest 5 (`>=5.0.0 <6.0.0`) with the package as a dev dependency:

```sh
npm install -D vitest@^5 @effect/vitest
```

Vitest 5 supports Node.js `^22.12.0 || ^24.0.0 || >=26.0.0` and Vite 6.4 or later within majors 6, 7, and 8.

## Links

- [Website](https://effect.website): documentation, guides, and news.
- [Reference](https://effect.website/docs/v4/api/vitest): API documentation for this package.
- [Discord](https://discord.gg/effect-ts): ask questions, share what you're building, and talk to the core team.
- [Community](https://effect.website/community-hub): meetups and events, or bring Effect to your own.
- [Issues](https://github.com/Effect-TS/effect/issues): bug reports and feature requests.

## Let's talk

Whether your team is considering Effect, rolling it out, or already running it in production, we'd love to hear from you: what you're building, what works, and what you need from Effect next.

- **Talk to the maintainers.** Introduce your team on [Discord](https://discord.gg/effect-ts) or email [contact@effectful.co](mailto:contact@effectful.co). We're happy to connect privately on Slack or Discord for feedback and help with adoption.
- **Production support.** We're exploring how to better support teams running Effect in production. If your organization has specific support needs, let's discuss them.
- **Adoption help.** Our [adoption partners](https://effect.website/adoption-partners) offer implementation, consulting, team extension, training, and commercial support.

## Migrating to Vitest 5

The package re-exports Vitest's public API. Upgrading removes the same exports and helpers that Vitest 5 removes; it does not provide compatibility shims.

- Replace `test.sequential`, `it.sequential`, `describe.sequential`, and `{ sequential: true }` with `{ concurrent: false }`. Set this explicitly for suites that share mutable state or depend on test order when concurrency is enabled.
- Replace the top-level `bench` import with the test-context fixture:

  ```ts
  import { test } from "@effect/vitest"

  test("sort", async ({ bench }) => {
    await bench("sort", () => [3, 1, 2].sort()).run()
  })
  ```

  Use `test.skip`, `test.only`, or `test.todo` on the enclosing test. The old `BenchFactory`, `BenchFunction`, `BenchTask`, `BenchTaskResult`, `Benchmark`, `BenchmarkAPI`, `BenchmarkResult`, and `BenchmarkRunner` exports are removed. Use the fixture's `Bench`, `BenchFn`, `BenchRegistration`, and `BenchResult` types as appropriate; custom benchmark engines use `BenchmarkProvider`.
- Change `Assertion<T>` to `Assertion<void, T>` for synchronous assertions or `Assertion<Promise<void>, T>` for asynchronous assertions. Augment `Matchers<R, T>` in `vitest` for custom matchers. Vitest's assertion state is no longer shared with `@vitest/expect`.
- The `ExpectPollOptions` export is removed. Derive the options type with `NonNullable<Parameters<typeof expect.poll>[1]>` when needed.
- Import reporter types from `vitest/node` and environment or snapshot APIs from `vitest/runtime`.

Vitest 5 clears mock call history before each test by default and requires asynchronous assertions to be awaited. JSON reporters write to a file by default; use an explicit `outputFile` when consuming their results. See the [Vitest migration guide](https://vitest.dev/guide/migration/) for the remaining upstream changes.

The Effect helpers retain their existing calling convention: `it.effect(name, effect, options)`, `it.live(name, effect, options)`, shared layers, and property tests.

Both `layer` and `it.layer` accept `{ concurrent: false }` to serialize a named shared-layer suite, or `{ concurrent: true }` to run its tests concurrently. Omitting the option inherits suite concurrency; nested named layers can override it. Anonymous layers always inherit the enclosing suite's concurrency, regardless of the option.

In concurrent tests, use the callback's `ctx.expect` so snapshots and assertion counts belong to the right test.

## Overview

The main entry point is the following import:

```ts
import { it } from "@effect/vitest"
```

This import enhances the standard `it` function from `vitest` with several powerful features, including:

| Feature        | Description                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------- |
| `it.effect`    | Runs a scoped test with test services such as `TestClock` and `TestConsole`.                        |
| `it.live`      | Runs a scoped test with the live Effect environment.                                                |
| `it.layer`     | Shares a `Layer` between multiple tests.                                                            |
| `it.prop`      | Runs property tests using Effect `Schema` and `Arbitrary` values.                                   |
| `it.flakyTest` | Retries an Effect that might occasionally fail until it succeeds or reaches the configured timeout. |

Property tests shrink callbacks that return `false`, throw, or complete with a non-interruption Effect failure. This
includes failed assertions, typed failures, and defects. Effect interruption still interrupts the test. Returning
normally with any value other than `false`, including `void`, passes for that generated input.

The Vitest `timeout` interrupts the Effect fiber running property generation, evaluation, and shrinking. Effect
finalizers run during the interruption, which is reported as a test timeout rather than a property falsification. As
with other Effect programs, a timeout cannot preempt a synchronous JavaScript callback that does not return.

## Writing Tests with `it.effect`

Here's how to use `it.effect` to write your tests:

**Syntax**

```ts
import { it } from "@effect/vitest"

it.effect("test name", () => EffectContainingAssertions, timeout: number | TestOptions = 5_000)
```

`it.effect` automatically provides the Effect test services, including [`TestClock`](#using-the-testclock), and a fresh `Scope` for each test. The scope is closed when the test finishes.

### Testing Successful Operations

To write a test, place your assertions directly within the main effect. This ensures that your assertions are evaluated as part of the test's execution.

**Example** (Testing a Successful Operation)

In the following example, we test a function that divides two numbers, but fails if the divisor is zero. The goal is to check that the function returns the correct result when given valid input.

```ts
import { expect, it } from "@effect/vitest"
import { Effect } from "effect"

// A simple divide function that returns an Effect, failing when dividing by zero
function divide(a: number, b: number) {
  if (b === 0) return Effect.fail("Cannot divide by zero")
  return Effect.succeed(a / b)
}

// Testing a successful division
it.effect("test success", () =>
  Effect.gen(function*() {
    const result = yield* divide(4, 2) // Expect 4 divided by 2 to succeed
    expect(result).toBe(2) // Assert that the result is 2
  }))
```

### Testing Successes and Failures as `Exit`

When you need to handle both success and failure cases in a test, you can use `Effect.exit` to capture the outcome as an `Exit` object. This allows you to verify both successful and failed results within the same test structure.

**Example** (Testing Success and Failure with `Exit`)

```ts
import { expect, it } from "@effect/vitest"
import { Effect, Exit } from "effect"

// A function that divides two numbers and returns an Effect.
// It fails if the divisor is zero.
function divide(a: number, b: number) {
  if (b === 0) return Effect.fail("Cannot divide by zero")
  return Effect.succeed(a / b)
}

// Test case for a successful division, using `Effect.exit` to capture the result
it.effect("test success as Exit", () =>
  Effect.gen(function*() {
    const result = yield* Effect.exit(divide(4, 2)) // Capture the result as an Exit
    expect(result).toStrictEqual(Exit.succeed(2)) // Expect success with the value 2
  }))

// Test case for a failure (division by zero), using `Effect.exit`
it.effect("test failure as Exit", () =>
  Effect.gen(function*() {
    const result = yield* Effect.exit(divide(4, 0)) // Capture the result as an Exit
    expect(result).toStrictEqual(Exit.fail("Cannot divide by zero")) // Expect failure with the correct message
  }))
```

### Using the TestClock

When writing tests with `it.effect`, Effect test services are automatically provided. These include the [`TestClock`](https://effect.website/docs/guides/testing/testclock), which allows you to simulate the passage of time in your tests.

**Note**: If you want to use the real-time clock (instead of the simulated one), you can switch to `it.live`.

**Example** (Using `TestClock` and `it.live`)

Here are examples that demonstrate how you can work with time in your tests using `it.effect` and `TestClock`:

1. **Using `it.live` to show the current time**: This will display the actual system time, since it runs in the live environment.

2. **Using `it.effect` without adjustments**: By default, the `TestClock` starts at `0`, simulating the beginning of time for your test without any time passing.

3. **Using `it.effect` and adjusting time**: In this test, we simulate the passage of time by advancing the clock by 1000 milliseconds (1 second).

```ts
import { it } from "@effect/vitest"
import { Clock, Effect } from "effect"
import { TestClock } from "effect/testing"

// Effect to log the current time
const logNow = Effect.gen(function*() {
  const now = yield* Clock.currentTimeMillis // Fetch the current time from the clock
  console.log(now) // Log the current time
})

// Example of using the real system clock with `it.live`
it.live("runs the test with the live Effect environment", () =>
  Effect.gen(function*() {
    yield* logNow // Prints the actual current time
  }))

// Example of using `it.effect` with the default test environment
it.effect("run the test with the test environment", () =>
  Effect.gen(function*() {
    yield* logNow // Prints 0, as the test clock starts at 0
  }))

// Example of advancing the test clock by 1000 milliseconds
it.effect("run the test with the test environment and the time adjusted", () =>
  Effect.gen(function*() {
    yield* TestClock.adjust("1000 millis") // Move the clock forward by 1000 milliseconds
    yield* logNow // Prints 1000, reflecting the adjusted time
  }))
```

### Skipping Tests

If you need to temporarily disable a test but don't want to delete or comment out the code, you can use `it.effect.skip`. This is helpful when you're working on other parts of your test suite but want to keep the test for future execution.

**Example** (Skipping a Test)

```ts
import { it } from "@effect/vitest"
import { expect } from "@effect/vitest"
import { Effect, Exit } from "effect"

function divide(a: number, b: number) {
  if (b === 0) return Effect.fail("Cannot divide by zero")
  return Effect.succeed(a / b)
}

// Temporarily skip the test for dividing numbers
it.effect.skip("test failure as Exit", () =>
  Effect.gen(function*() {
    const result = yield* Effect.exit(divide(4, 0))
    expect(result).toStrictEqual(Exit.fail("Cannot divide by zero"))
  }))
```

### Running a Single Test

When you're developing or debugging, it's often useful to run a specific test without executing the entire test suite. You can achieve this by using `it.effect.only`, which will run just the selected test and ignore the others.

**Example** (Running a Single Test)

```ts
import { it } from "@effect/vitest"
import { expect } from "@effect/vitest"
import { Effect, Exit } from "effect"

function divide(a: number, b: number) {
  if (b === 0) return Effect.fail("Cannot divide by zero")
  return Effect.succeed(a / b)
}

// Run only this test, skipping all others
it.effect.only("test failure as Exit", () =>
  Effect.gen(function*() {
    const result = yield* Effect.exit(divide(4, 0))
    expect(result).toStrictEqual(Exit.fail("Cannot divide by zero"))
  }))
```

### Expecting Tests to Fail

When adding new failing tests, you might not be able to fix them right away. Instead of skipping them, you may want to assert it fails, so that when you fix them, you'll know and can re-enable them before it regresses.

**Example** (Asserting one test fails)

```ts
import { it } from "@effect/vitest"
import { Effect, Exit } from "effect"

function divide(a: number, b: number) {
  if (b === 0) return Effect.fail("Cannot divide by zero")
  return Effect.succeed(a / b)
}

// Temporarily assert that the test for dividing by zero fails.
it.effect.fails("dividing by zero special cases", ({ expect }) =>
  Effect.gen(function*() {
    const result = yield* Effect.exit(divide(4, 0))
    expect(result).toStrictEqual(0)
  }))
```

### Logging

By default, `it.effect` suppresses log output, which can be useful for keeping test results clean. However, if you want to enable logging during tests, you can use `it.live` or provide a custom logger to control the output.

**Example** (Controlling Logging in Tests)

```ts
import { it } from "@effect/vitest"
import { Effect, Logger } from "effect"

// This test won't display the log message, as logging is suppressed by default in `it.effect`
it.effect("does not display a log", () =>
  Effect.gen(function*() {
    yield* Effect.log("it.effect") // Log won't be shown
  }))

// This test will display the log because a custom logger is provided
it.effect("providing a logger displays a log", () =>
  Effect.gen(function*() {
    yield* Effect.log("it.effect with custom logger") // Log will be displayed
  }).pipe(
    Effect.provide(Logger.layer([Logger.consolePretty()])) // Providing a pretty logger for log output
  ))

// This test runs using `it.live`, which enables logging by default
it.live("it.live displays a log", () =>
  Effect.gen(function*() {
    yield* Effect.log("it.live") // Log will be displayed
  }))
```

## Resource Safety and Scope

Both `it.effect` and `it.live` provide a fresh `Scope` and close it after each test. Test bodies can therefore use scoped resources directly. Do not wrap the test body in `Effect.scoped`, because the test runner already manages its scope.

**Example** (Managing a Resource Lifecycle)

```ts
import { it } from "@effect/vitest"
import { Console, Effect } from "effect"

// Simulating the acquisition and release of a resource with console logging
const acquire = Console.log("acquire resource")
const release = Console.log("release resource")

// Defining a resource that requires proper management
const resource = Effect.acquireRelease(acquire, () => release)

it.effect("run with scope", () =>
  Effect.gen(function*() {
    yield* resource
  }))
```

## Using Vitest Fixtures

To use [Vitest fixtures](https://vitest.dev/guide/test-context#extend-test-context) in Effect tests, pass a test extended with `test.extend` to `makeMethods`. It returns the same helpers as `it`, and each test receives the fixtures it destructures from its context.

**Example** (Sharing a Database Across a Test File)

```ts
import { assert, makeMethods, test } from "@effect/vitest"
import { PGlite } from "@electric-sql/pglite"
import { Effect } from "effect"

const it = makeMethods(
  test.extend("db", { scope: "file" }, async ({}, { onCleanup }) => {
    const db = await PGlite.create()
    onCleanup(() => db.close())
    return db
  })
)

it.effect("runs a query", ({ db }) =>
  Effect.gen(function*() {
    const result = yield* Effect.promise(() => db.query("select 1 as one"))
    assert.deepStrictEqual(result.rows, [{ one: 1 }])
  }))
```

Destructure the fixtures a test uses: Vitest reads those names to decide what to set up, and rejects `(ctx) =>` once any fixture is defined. `it.effect.each` passes the context after the test case. Property tests cannot request fixtures, but auto fixtures still run. Build `makeMethods` from `test` or `test.extend(...)`, not from the test a `describe` callback receives: that API is bound to the outer suite, so tests in a named `it.layer` can end up outside their named suite and miss its hooks and concurrency setting.

## Writing Tests with `it.flakyTest`

`it.flakyTest` is a utility designed to manage tests that may not succeed consistently on the first attempt. These tests, often referred to as "flaky," can fail due to factors like timing issues, external dependencies, or randomness. `it.flakyTest` allows for retrying these tests until they pass or a specified timeout is reached.

**Example** (Handling Flaky Tests with Retries)

Let's start by setting up a basic test scenario that has the potential to fail randomly:

```ts
import { it } from "@effect/vitest"
import { Effect, Random } from "effect"

// Simulating a flaky effect
const flaky = Effect.gen(function*() {
  const random = yield* Random.nextBoolean
  if (random) {
    return yield* Effect.fail("Failed due to randomness")
  }
})

// Standard test that may fail intermittently
it.effect("possibly failing test", () => flaky)
```

In this test, the outcome is random, so the test might fail depending on the result of `Random.nextBoolean`.

To handle this flakiness, we use `it.flakyTest` to retry the test until it passes, or until a defined timeout expires:

```ts
// Retrying the flaky test with a 5-second timeout
it.effect("retrying until success or timeout", () => it.flakyTest(flaky, "5 seconds"))
```
