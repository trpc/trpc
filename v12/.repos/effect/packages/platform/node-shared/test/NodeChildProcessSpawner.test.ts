import { buildSpawnOptions } from "@effect/platform-node-shared/internal/nodeChildProcessSpawner"
import * as NodeChildProcessSpawner from "@effect/platform-node-shared/NodeChildProcessSpawner"
import * as NodeFileSystem from "@effect/platform-node-shared/NodeFileSystem"
import * as NodePath from "@effect/platform-node-shared/NodePath"
import { assert, describe, it } from "@effect/vitest"
import * as ChildProcessSpawnerTest from "effect-test/process/ChildProcessSpawnerTest"
import * as ByteSize from "effect/ByteSize"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as ChildProcess from "effect/process/ChildProcess"
import * as Scope from "effect/Scope"
import * as Stream from "effect/Stream"
import NodeChildProcess, { spawnSync } from "node:child_process"
import { syncBuiltinESMExports } from "node:module"
import { join } from "node:path"
import { vi } from "vitest"

const NodeServices = NodeChildProcessSpawner.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(
    NodeFileSystem.layer,
    NodePath.layer
  ))
)

ChildProcessSpawnerTest.suite("NodeChildProcessSpawner", NodeServices, {
  processGroups: true
})

describe.skipIf(process.platform === "win32")("error descriptions", () => {
  it.effect("quote arguments and escape control characters", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(ChildProcess.make("nonexistent-command-12345", ["a b", "it's", "\u001b[2J"]))

      assert.strictEqual(error.reason._tag, "NotFound")
      assert.strictEqual(
        error.reason._tag === "NotFound" ? error.reason.pathOrDescriptor : undefined,
        "nonexistent-command-12345 'a b' 'it'\\''s' '\\u001b[2J'"
      )
    }).pipe(Effect.provide(NodeServices)))
})

describe("Windows cleanup", { concurrent: false }, () => {
  for (const signal of [false, true]) {
    it.skipIf(signal && process.platform === "win32")(
      `does not taskkill a ${signal ? "signal-terminated" : "failed"} child during exit, kill or scope release`,
      async () => {
        const platform = Object.getOwnPropertyDescriptor(process, "platform")!
        const taskkill = vi.spyOn(NodeChildProcess, "execFile").mockImplementation((...args) => {
          const callback = args.at(-1)
          if (typeof callback === "function") callback(null, "", "")
          return new NodeChildProcess.ChildProcess()
        })
        syncBuiltinESMExports()
        try {
          await Effect.runPromise(
            Effect.scoped(Effect.gen(function*() {
              const handle = yield* ChildProcess.make(process.execPath, [
                "-e",
                signal ? "process.kill(process.pid, 'SIGTERM')" : "process.exit(1)"
              ])
              // Spawn natively, then exercise the Windows exit and cleanup paths.
              Object.defineProperty(process, "platform", { value: "win32" })
              if (signal) {
                assert.isTrue(Exit.isFailure(yield* Effect.exit(handle.exitCode)))
              } else {
                assert.strictEqual(yield* handle.exitCode, 1)
              }
              yield* handle.kill()
            })).pipe(Effect.provide(NodeServices))
          )
          assert.strictEqual(taskkill.mock.calls.length, 0)
        } finally {
          Object.defineProperty(process, "platform", platform)
          taskkill.mockRestore()
          syncBuiltinESMExports()
        }
      }
    )
  }
})

describe.skipIf(process.platform === "win32")("non-detached exit cleanup", { concurrent: false }, () => {
  for (const signal of [false, true]) {
    it.live(
      `does not signal the process group of a ${
        signal ? "signal-terminated" : "failed"
      } child during exit, kill or scope release`,
      () =>
        Effect.gen(function*() {
          const kill = vi.spyOn(process, "kill")
          yield* Effect.addFinalizer(() => Effect.sync(() => kill.mockRestore()))
          let pid = 0
          yield* Effect.scoped(Effect.gen(function*() {
            const handle = yield* ChildProcess.make(process.execPath, [
              "-e",
              signal ? "process.kill(process.pid, 'SIGTERM')" : "process.exit(1)"
            ], { detached: false, forceKillAfter: "100 millis" })
            pid = handle.pid
            if (signal) {
              assert.isTrue(Exit.isFailure(yield* Effect.exit(handle.exitCode)))
            } else {
              assert.strictEqual(yield* handle.exitCode, 1)
            }
            // The exited child's PID may now lead an unrelated process group.
            yield* Effect.ignore(handle.kill())
          }))
          assert.deepStrictEqual(kill.mock.calls.filter(([target]) => target === -pid), [])
        }).pipe(Effect.scoped, Effect.provide(NodeServices))
    )
  }

  it.live("does not poll or force kill the process group of a child that exits during scope release", () =>
    Effect.gen(function*() {
      const kill = vi.spyOn(process, "kill")
      yield* Effect.addFinalizer(() => Effect.sync(() => kill.mockRestore()))
      let pid = 0
      yield* Effect.scoped(Effect.gen(function*() {
        const handle = yield* ChildProcess.make(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
          detached: false,
          forceKillAfter: "1 second"
        })
        pid = handle.pid
      }))
      // Signalling the live child is fine; polling or escalating after it exits is not.
      assert.deepStrictEqual(kill.mock.calls.filter(([target, signal]) => target === -pid && signal !== "SIGTERM"), [])
    }).pipe(Effect.scoped, Effect.provide(NodeServices)))
})

const zombieProbes = 3

// macOS answers EPERM rather than ESRCH while the group's remaining members are zombies.
const stubZombieProcessGroup = Effect.fnUntraced(function*() {
  const nativeKill = process.kill.bind(process)
  const group = { pid: 0, probes: 0, signals: [] as Array<string | number | undefined> }
  const kill = vi.spyOn(process, "kill").mockImplementation((target, signal) => {
    if (group.pid === 0 || target !== -group.pid) {
      return nativeKill(target, signal)
    }
    if (signal === 0) {
      group.probes++
    } else {
      group.signals.push(signal)
    }
    throw Object.assign(new Error("kill"), { code: group.probes <= zombieProbes ? "EPERM" : "ESRCH" })
  })
  yield* Effect.addFinalizer(() => Effect.sync(() => kill.mockRestore()))
  return group
})

describe.skipIf(process.platform === "win32")("detached exit cleanup", { concurrent: false }, () => {
  it.live("kill waits for a process group that exists but cannot be signalled", () =>
    Effect.gen(function*() {
      const group = yield* stubZombieProcessGroup()
      const handle = yield* ChildProcess.make(process.execPath, ["-e", "setInterval(() => {}, 1000)"])
      group.pid = handle.pid

      yield* handle.kill()

      assert.strictEqual(group.probes, zombieProbes + 1)
    }).pipe(Effect.scoped, Effect.provide(NodeServices)))

  it.live("kill escalates and waits for a process group whose exited leader left only zombies", () =>
    Effect.gen(function*() {
      const group = yield* stubZombieProcessGroup()
      const handle = yield* ChildProcess.make(process.execPath, ["-e", ""])
      group.pid = handle.pid
      assert.strictEqual(yield* handle.exitCode, 0)

      yield* handle.kill({ forceKillAfter: "0 millis" })

      assert.deepStrictEqual(group.signals, ["SIGTERM", "SIGKILL"])
      assert.strictEqual(group.probes, zombieProbes + 1)
    }).pipe(Effect.scoped, Effect.provide(NodeServices)))
})

// Synchronous fixture runs must not block other tests with active timeout budgets.
describe("interrupted buffered input", { concurrent: false, timeout: 15_000 }, () => {
  for (const input of ["stdin", "fd3"] as const) {
    it(`does not crash the host when ${input} is interrupted`, () => {
      // Isolate the host so an unhandled writable error becomes an assertion
      // failure rather than an uncaught exception in the test runner.
      const result = spawnSync(process.execPath, [join(__dirname, "fixtures", "buffered-input.ts"), input], {
        encoding: "utf8",
        timeout: 10_000
      })
      assert.strictEqual(result.error, undefined)
      assert.strictEqual(result.status, 0, result.stderr)
      assert.strictEqual(result.stdout, "program finished: Failure\nstill alive after 500ms\n")
    })
  }
})

describe("buildSpawnOptions", () => {
  const base = { stdio: "pipe" } as const

  it("defaults to hiding non-detached Windows children", () => {
    assert.deepStrictEqual(buildSpawnOptions({}, base, "win32"), {
      stdio: "pipe",
      detached: false,
      shell: undefined,
      windowsHide: true
    })
    assert.deepStrictEqual(buildSpawnOptions({ detached: true }, base, "win32"), {
      stdio: "pipe",
      detached: true,
      shell: undefined,
      windowsHide: false
    })
    assert.deepStrictEqual(buildSpawnOptions({ detached: false }, base, "win32"), {
      stdio: "pipe",
      detached: false,
      shell: undefined,
      windowsHide: true
    })
  })

  it("allows windowsHide to be configured independently of detached", () => {
    assert.deepStrictEqual(
      buildSpawnOptions({ detached: false, windowsHide: false }, base, "win32"),
      {
        stdio: "pipe",
        detached: false,
        shell: undefined,
        windowsHide: false
      }
    )
    assert.deepStrictEqual(
      buildSpawnOptions({ detached: true, windowsHide: true }, base, "win32"),
      {
        stdio: "pipe",
        detached: true,
        shell: undefined,
        windowsHide: true
      }
    )
  })
})

it.live("kills every process in a pipeline", () =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const directory = yield* fs.makeTempDirectoryScoped()
    const rootHeartbeat = `${directory}/root-heartbeat`
    const childHeartbeat = `${directory}/child-heartbeat`
    const handle = yield* ChildProcess.make(
      "sh",
      [
        "-c",
        "printf x >> \"$1\"; printf 'ROOT_READY\\n'; while :; do printf x >> \"$1\"; sleep 0.01; done",
        "pipeline-root",
        rootHeartbeat
      ]
    ).pipe(ChildProcess.pipeTo(ChildProcess.make(
      "sh",
      [
        "-c",
        "printf x >> \"$1\"; printf 'CHILD_READY\\n'; read -r ready; printf '%s\\n' \"$ready\"; while :; do printf x >> \"$1\"; sleep 0.01; done",
        "pipeline-child",
        childHeartbeat
      ]
    )))
    const readyLines = yield* handle.stdout.pipe(
      Stream.decodeText,
      Stream.splitLines,
      Stream.take(2),
      Stream.runCollect
    )
    assert.deepStrictEqual(readyLines, ["CHILD_READY", "ROOT_READY"])
    yield* handle.kill({ killSignal: "SIGKILL" })
    const rootSizeAfterKill = (yield* fs.stat(rootHeartbeat)).size
    const childSizeAfterKill = (yield* fs.stat(childHeartbeat)).size
    yield* Effect.sleep("100 millis")
    const rootFinalSize = (yield* fs.stat(rootHeartbeat)).size
    const childFinalSize = (yield* fs.stat(childHeartbeat)).size

    assert.strictEqual(ByteSize.toBigInt(rootFinalSize), ByteSize.toBigInt(rootSizeAfterKill))
    assert.strictEqual(ByteSize.toBigInt(childFinalSize), ByteSize.toBigInt(childSizeAfterKill))
  }).pipe(Effect.scoped, Effect.provide(NodeServices)))

const processGroupFixture = join(__dirname, "fixtures", "process-group.ts")

// Use native timers under TestClock.
const liveSleep = (millis: number) =>
  Effect.callback<void>((resume) => {
    const timer = setTimeout(() => resume(Effect.void), millis)
    return Effect.sync(() => clearTimeout(timer))
  })

const liveTimeout = (millis: number) => <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.raceFirst(effect, liveSleep(millis).pipe(Effect.andThen(Effect.die(new Error("timed out")))))

const startProcessGroup = Effect.fnUntraced(function*(
  mode: "exit-on-signal" | "ignore-signal",
  options?: ChildProcess.CommandOptions,
  delays: { readonly leader: number; readonly descendant: number } = { leader: 0, descendant: 200 }
) {
  const fs = yield* FileSystem.FileSystem
  const directory = yield* fs.makeTempDirectoryScoped()
  const marker = `${directory}/marker`
  const scope = yield* Scope.fork(yield* Effect.scope)
  const handle = yield* Scope.provide(scope)(ChildProcess.make(
    process.execPath,
    [processGroupFixture, "leader", mode, marker, String(delays.leader), String(delays.descendant)],
    { stdin: "ignore", ...options }
  ))
  const ready = yield* Deferred.make<number>()
  yield* handle.stdout.pipe(
    Stream.decodeText,
    Stream.splitLines,
    Stream.runForEach((line) =>
      line.startsWith("READY ") ? Deferred.succeed(ready, Number(line.slice("READY ".length))) : Effect.void
    ),
    Effect.forkScoped
  )
  const descendantPid = yield* Deferred.await(ready).pipe(liveTimeout(5_000))
  return { handle, descendantPid, marker, scope }
})

const killDescendant = (pid: number) =>
  Effect.sync(() => {
    try {
      process.kill(pid, "SIGKILL")
    } catch {}
  })

const assertHeartbeatStopped = Effect.fnUntraced(function*(marker: string) {
  const fs = yield* FileSystem.FileSystem
  const sizeAfterKill = (yield* fs.stat(marker)).size
  yield* liveSleep(100)
  const finalSize = (yield* fs.stat(marker)).size
  assert.strictEqual(finalSize, sizeAfterKill)
})

const timed = Effect.fnUntraced(function*<A, E, R>(effect: Effect.Effect<A, E, R>) {
  const start = Date.now()
  yield* effect
  return Date.now() - start
})

describe.skipIf(process.platform === "win32")("process group cleanup", () => {
  it.live("scope release cleans descendants after the leader exits successfully", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const { descendantPid, handle, marker, scope } = yield* startProcessGroup("exit-on-signal", { stdin: "pipe" })
      yield* Effect.addFinalizer(() => killDescendant(descendantPid))

      yield* Stream.run(Stream.make(new TextEncoder().encode("exit\n")), handle.stdin)
      assert.strictEqual(yield* handle.exitCode, 0)
      assert.doesNotThrow(() => process.kill(descendantPid, 0), "descendant must still be alive after the leader exits")
      assert.isFalse(yield* fs.exists(marker))

      yield* Scope.close(scope, Exit.void)

      assert.strictEqual(yield* fs.readFileString(marker), "exited")
    }).pipe(Effect.scoped, Effect.provide(NodeServices)))

  it.live("scope release force kills descendants after the leader exits with a non-zero code", () =>
    Effect.gen(function*() {
      const { descendantPid, handle, marker, scope } = yield* startProcessGroup("ignore-signal", {
        stdin: "pipe",
        forceKillAfter: "200 millis"
      })
      yield* Effect.addFinalizer(() => killDescendant(descendantPid))

      yield* Stream.run(Stream.make(new TextEncoder().encode("exit 1\n")), handle.stdin)
      assert.strictEqual(yield* handle.exitCode, 1)

      yield* Scope.close(scope, Exit.void).pipe(liveTimeout(2_000))

      yield* assertHeartbeatStopped(marker)
    }).pipe(Effect.scoped, Effect.provide(NodeServices)))

  it.live("scope release cleans descendants after the leader is killed externally", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const { descendantPid, handle, marker, scope } = yield* startProcessGroup("exit-on-signal")
      yield* Effect.addFinalizer(() => killDescendant(descendantPid))

      process.kill(handle.pid, "SIGKILL")
      assert.isTrue(Exit.isFailure(yield* Effect.exit(handle.exitCode)))
      assert.doesNotThrow(() => process.kill(descendantPid, 0), "descendant must survive the leader's SIGKILL")
      assert.isFalse(yield* fs.exists(marker))

      yield* Scope.close(scope, Exit.void)

      assert.isTrue(yield* fs.exists(marker), "scope release must wait for the descendant's exit marker")
      assert.strictEqual(yield* fs.readFileString(marker), "exited")
    }).pipe(Effect.scoped, Effect.provide(NodeServices)))

  it.live("scope release waits for descendants that outlive the leader", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const { handle, marker, scope } = yield* startProcessGroup("exit-on-signal")

      yield* Scope.close(scope, Exit.void)

      assert.isFalse(yield* handle.isRunning)
      assert.isTrue(yield* fs.exists(marker))
    }).pipe(Effect.scoped, Effect.provide(NodeServices)))

  it.live("scope release drains descendants after a slow leader exits", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const { descendantPid, handle, marker, scope } = yield* startProcessGroup("exit-on-signal", undefined, {
        leader: 1_500,
        descendant: 2_000
      })
      yield* Effect.addFinalizer(() => killDescendant(descendantPid))

      const releaseMillis = yield* timed(Scope.close(scope, Exit.void))

      assert.isAtLeast(releaseMillis, 1_500)
      assert.isFalse(yield* handle.isRunning)
      assert.isTrue(yield* fs.exists(marker), "scope release must wait for the descendant's exit marker")
      assert.strictEqual(yield* fs.readFileString(marker), "exited")
    }).pipe(Effect.provide(NodeServices)))

  it.live("scope release force kills descendants that ignore the kill signal", () =>
    Effect.gen(function*() {
      const { marker, scope } = yield* startProcessGroup("ignore-signal", { forceKillAfter: "200 millis" })

      yield* Scope.close(scope, Exit.void)

      yield* assertHeartbeatStopped(marker)
    }).pipe(Effect.scoped, Effect.provide(NodeServices)))

  it.live("kill force kills descendants that ignore the kill signal", () =>
    Effect.gen(function*() {
      const { handle, marker, scope } = yield* startProcessGroup("ignore-signal")

      yield* handle.kill({ forceKillAfter: "200 millis" })

      assert.isFalse(yield* handle.isRunning)
      yield* assertHeartbeatStopped(marker)
      yield* Scope.close(scope, Exit.void)
    }).pipe(Effect.scoped, Effect.provide(NodeServices)))

  it.effect("forceKillAfter escalation does not depend on the Effect clock", () =>
    Effect.gen(function*() {
      const { marker, scope } = yield* startProcessGroup("ignore-signal", { forceKillAfter: "200 millis" })

      const releaseMillis = yield* timed(Scope.close(scope, Exit.void))

      assert.isBelow(releaseMillis, 2_000)
      yield* assertHeartbeatStopped(marker)
    }).pipe(Effect.scoped, Effect.provide(NodeServices)))

  it.live("scope release returns when a descendant holds the inherited pipe without forceKillAfter", () =>
    Effect.gen(function*() {
      const { descendantPid, handle, scope } = yield* startProcessGroup("ignore-signal")

      yield* Effect.gen(function*() {
        const releaseMillis = yield* timed(Scope.close(scope, Exit.void))

        assert.isFalse(yield* handle.isRunning)
        assert.isAtLeast(releaseMillis, 1_000)
        assert.isBelow(releaseMillis, 3_000)
      }).pipe(Effect.ensuring(killDescendant(descendantPid)))
    }).pipe(Effect.scoped, Effect.provide(NodeServices)))
})

it.live("scope release returns when stdout is unread and backpressured", () =>
  Effect.gen(function*() {
    const releaseMillis = yield* timed(Effect.scoped(Effect.gen(function*() {
      yield* ChildProcess.make(process.execPath, [
        "-e",
        "process.stdout.write(\"x\".repeat(1024 * 1024)); setInterval(() => {}, 1000)"
      ], { stdin: "ignore" })
      yield* Effect.sleep("100 millis")
    })))

    assert.isBelow(releaseMillis, 2_000)
  }).pipe(Effect.provide(NodeServices)))
