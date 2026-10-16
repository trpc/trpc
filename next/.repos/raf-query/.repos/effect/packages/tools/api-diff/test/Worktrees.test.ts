import type { ApiSnapshot } from "@effect/api-diff/Model"
import { Snapshotter } from "@effect/api-diff/Snapshot"
import { Worktrees } from "@effect/api-diff/Worktrees"
import { assert, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Sink from "effect/Sink"
import * as Stream from "effect/Stream"

const snapshot = {
  version: 1,
  compiler: { name: "typescript", version: "fixture" },
  ref: "main",
  sha: "a".repeat(40),
  packages: [],
  entrypoints: [],
  entities: [],
  diagnostics: [],
  toJSON() {
    throw new RangeError("Invalid string length")
  }
} as ApiSnapshot

const SnapshotterTest = Layer.succeed(
  Snapshotter,
  Snapshotter.of({ extract: () => Effect.succeed(snapshot) })
)

const ChildProcessSpawnerTest = Layer.succeed(
  ChildProcessSpawner.ChildProcessSpawner,
  ChildProcessSpawner.make(() =>
    Effect.succeed(ChildProcessSpawner.makeHandle({
      pid: ChildProcessSpawner.ProcessId(1),
      stdin: Sink.drain,
      stdout: Stream.empty,
      stderr: Stream.empty,
      all: Stream.empty,
      exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
      isRunning: Effect.succeed(false),
      kill: () => Effect.void,
      getInputFd: () => Sink.drain,
      getOutputFd: () => Stream.empty,
      unref: Effect.succeed(Effect.void)
    }))
  )
)

it.effect("skips the cache write when a snapshot is too large to serialize", () => {
  let writes = 0
  const FileSystemTest = FileSystem.layerNoop({
    exists: (location) => Effect.succeed(location.endsWith("tsconfig.base.json")),
    makeDirectory: () => Effect.void,
    makeTempDirectoryScoped: () => Effect.succeed("/worktrees/head-1"),
    readFileString: () => Effect.succeed(`{"compilerOptions":{"stripInternal":true}}`),
    writeFileString: () =>
      Effect.sync(() => {
        writes++
      })
  })
  const MainLayer = Worktrees.layerNoDependencies.pipe(
    Layer.provide(Layer.mergeAll(
      FileSystemTest,
      Path.layer,
      SnapshotterTest,
      ChildProcessSpawnerTest
    ))
  )

  return Effect.gen(function*() {
    const worktrees = yield* Worktrees
    const result = yield* worktrees.prepareSnapshot({
      repoRoot: "/repo",
      cacheRoot: "/cache",
      worktreesRoot: "/worktrees",
      name: "head",
      ref: snapshot.ref,
      sha: snapshot.sha
    })

    assert.strictEqual(result, snapshot)
    assert.strictEqual(writes, 0)
  }).pipe(Effect.provide(MainLayer))
})
