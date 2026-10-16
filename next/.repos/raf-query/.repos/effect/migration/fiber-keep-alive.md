# Fiber Keep-Alive: Automatic Process Lifetime Management

In v3, the core `effect` runtime did **not** keep the Node.js process alive while
fibers were suspended on certain asynchronous operations. If a fiber was waiting on
something like `Deferred.await` and there was no other work scheduled on the
event loop, the process would exit immediately — the fiber's suspension did not
register as pending work from Node.js's perspective.

The only way to prevent this was to use `runMain` from `@effect/platform-node`
(or `@effect/platform-bun`), which installed a long-lived `setInterval` timer
to hold the process open until the root fiber completed.

In v4, **the keep-alive mechanism is built into the core runtime**.

## The Problem in v3

Consider the following program:

```ts
import { Deferred, Effect } from "effect"

const program = Effect.gen(function*() {
  const deferred = yield* Deferred.make<string>()

  yield* Deferred.await(deferred)
})

Effect.runPromise(program)
```

In v3, when the main fiber reached `yield* Deferred.await(deferred)`, it suspended
while waiting for the worker fiber to complete the deferred. However, from the
JavaScript runtime's perspective, the event loop had no more work to do. Thus,
the process would exit.

The workaround was to use `runMain` from the platform package, which installs
a timer that holds the process open until the root fiber completes:

```ts
import { NodeRuntime } from "@effect/platform-node"

NodeRuntime.runMain(program)
```

## What Changed in v4

In v4, the Effect fiber runtime automatically manages a reference-counted
keep-alive timer.

This means the following program works in v4 **without** `runMain`:

```ts
import { Deferred, Effect, Fiber } from "effect"

const program = Effect.gen(function*() {
  const deferred = yield* Deferred.make<string>()

  // The process stays alive while waiting — no runMain needed
  yield* Deferred.await(deferred)
})

Effect.runPromise(program)
```

## `runMain` Is Still Recommended

Even though the core runtime now handles keep-alive, `runMain` from the platform
packages is still the recommended way to run Effect programs. It provides:

- **Signal handling** — listens for `SIGINT` / `SIGTERM` and interrupts the
  root fiber gracefully.
- **Exit code management** — calls `process.exit(code)` when the program fails
  or receives a signal.
- **Error reporting** — reports unhandled errors to the console.
