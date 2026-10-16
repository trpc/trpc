import * as Console from "effect/Console"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as ChildProcess from "effect/process/ChildProcess"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Stream from "effect/Stream"
import { ApiDiffError, isApiDiffError } from "./Error.ts"
import { decodeJson } from "./Json.ts"
import type { ApiSnapshot } from "./Model.ts"
import { snapshotCacheKey, Snapshotter } from "./Snapshot.ts"

export interface PrepareSnapshotOptions {
  readonly repoRoot: string
  readonly cacheRoot: string
  readonly worktreesRoot: string
  readonly name: "base" | "head"
  readonly ref: string
  readonly sha: string
  readonly modules?: ReadonlyArray<string>
}

export class Worktrees extends Context.Service<Worktrees, {
  readonly resolveRef: (repoRoot: string, ref: string) => Effect.Effect<string, ApiDiffError>
  readonly prepareSnapshot: (options: PrepareSnapshotOptions) => Effect.Effect<ApiSnapshot, ApiDiffError>
}>()("@effect/api-diff/Worktrees") {
  static readonly layerNoDependencies = Layer.effect(
    Worktrees,
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const snapshotter = yield* Snapshotter
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner

      const runCommandScoped = Effect.fnUntraced(function*(
        command: string,
        args: ReadonlyArray<string>,
        cwd: string
      ) {
        const display = `${command} ${args.join(" ")}`
        const handle = yield* spawner.spawn(
          ChildProcess.make(command, args, { cwd })
        ).pipe(
          Effect.mapError((cause) =>
            new ApiDiffError({
              message: `Could not start command (${display})`,
              cause
            })
          )
        )
        const [output, exitCode] = yield* Effect.all([
          Stream.mkString(Stream.decodeText(handle.all)),
          handle.exitCode
        ], { concurrency: "unbounded" }).pipe(
          Effect.mapError((cause) =>
            new ApiDiffError({
              message: `Could not run command (${display})`,
              cause
            })
          )
        )
        return { display, exitCode, output }
      })

      const runCommand = (
        command: string,
        args: ReadonlyArray<string>,
        cwd: string
      ): Effect.Effect<{
        readonly display: string
        readonly exitCode: ChildProcessSpawner.ExitCode
        readonly output: string
      }, ApiDiffError> => Effect.scoped(runCommandScoped(command, args, cwd))

      const runChecked = Effect.fnUntraced(function*(
        command: string,
        args: ReadonlyArray<string>,
        cwd: string
      ) {
        const result = yield* runCommand(command, args, cwd)
        if (result.exitCode !== ChildProcessSpawner.ExitCode(0)) {
          return yield* new ApiDiffError({
            message: `Command failed (${result.display}):\n${result.output}`.trim()
          })
        }
        return result.output.trim()
      })

      const enableStripInternal = Effect.fnUntraced(function*(worktree: string) {
        const baseConfig = path.join(worktree, "tsconfig.base.json")
        if (!(yield* fs.exists(baseConfig))) {
          return
        }
        const source = yield* fs.readFileString(baseConfig)
        if (/"stripInternal"\s*:\s*true/.test(source)) {
          return
        }
        const updated = source.replace(/("stripInternal"\s*:\s*)false/, "$1true")
        if (updated !== source) {
          yield* fs.writeFileString(baseConfig, updated)
        }
      })

      const hasProductionStripInternal = Effect.fnUntraced(function*(worktree: string) {
        const candidates = [
          path.join(worktree, "tsconfig.base.json"),
          path.join(worktree, "tsconfig.build.json"),
          path.join(worktree, "packages", "effect", "tsconfig.build.json")
        ]
        for (const candidate of candidates) {
          if ((yield* fs.exists(candidate)) && /"stripInternal"\s*:\s*true/.test(yield* fs.readFileString(candidate))) {
            return true
          }
        }
        return false
      })

      const buildWorktree = Effect.fnUntraced(function*(worktree: string) {
        yield* enableStripInternal(worktree)
        if (!(yield* hasProductionStripInternal(worktree))) {
          return yield* new ApiDiffError({
            message: `No production TypeScript configuration enables stripInternal in ${worktree}`
          })
        }
        // Native test-only dependencies in old branches may not build on the
        // current Node runtime. Declaration emission does not require dependency lifecycle scripts.
        yield* runChecked("pnpm", ["install", "--frozen-lockfile", "--ignore-scripts"], worktree)
        yield* runChecked("pnpm", ["build"], worktree)
      })

      const removeWorktree = (repoRoot: string, worktree: string): Effect.Effect<void> =>
        runCommand("git", ["worktree", "remove", "--force", worktree], repoRoot).pipe(
          Effect.flatMap((result) =>
            result.exitCode === ChildProcessSpawner.ExitCode(0)
              ? Effect.void
              : Console.error(result.output)
          ),
          Effect.catch((error) => Console.error(error.message))
        )

      const resolveRef = Effect.fnUntraced(function*(repoRoot: string, ref: string) {
        return yield* runChecked("git", ["rev-parse", "--verify", `${ref}^{commit}`], repoRoot)
      })

      const prepareSnapshotInternal = Effect.fnUntraced(function*(options: PrepareSnapshotOptions) {
        const key = snapshotCacheKey(options.sha, options.modules)
        const cacheLocation = path.join(options.cacheRoot, key, "snapshot.json")
        if (yield* fs.exists(cacheLocation)) {
          const source = yield* fs.readFileString(cacheLocation).pipe(
            Effect.mapError((cause) =>
              new ApiDiffError({
                message: `Could not read cached snapshot ${cacheLocation}`,
                cause
              })
            )
          )
          const cached = (yield* decodeJson(source).pipe(
            Effect.mapError((cause) =>
              new ApiDiffError({
                message: `Could not parse cached snapshot ${cacheLocation}`,
                cause
              })
            )
          )) as ApiSnapshot
          return { ...cached, ref: options.ref, sha: options.sha }
        }

        yield* fs.makeDirectory(options.worktreesRoot, { recursive: true })
        return yield* Effect.scoped(Effect.gen(function*() {
          const runRoot = yield* fs.makeTempDirectoryScoped({
            directory: options.worktreesRoot,
            prefix: `${options.name}-`
          })
          const worktree = path.join(runRoot, "repo")
          return yield* Effect.acquireUseRelease(
            runChecked("git", ["worktree", "add", "--detach", worktree, options.sha], options.repoRoot),
            () =>
              Effect.gen(function*() {
                yield* buildWorktree(worktree)
                const snapshot = yield* snapshotter.extract({
                  repoRoot: worktree,
                  ref: options.ref,
                  sha: options.sha,
                  ...(options.modules === undefined ? {} : { modules: options.modules })
                }).pipe(
                  Effect.mapError((cause) =>
                    isApiDiffError(cause)
                      ? cause
                      : new ApiDiffError({
                        message: `Could not extract the ${options.name} API snapshot`,
                        cause
                      })
                  )
                )
                let encoded: string | undefined
                try {
                  encoded = JSON.stringify(snapshot)
                } catch {
                  encoded = undefined
                }
                if (encoded !== undefined) {
                  yield* fs.makeDirectory(path.dirname(cacheLocation), { recursive: true })
                  yield* fs.writeFileString(cacheLocation, encoded).pipe(
                    Effect.mapError((cause) =>
                      new ApiDiffError({
                        message: `Could not cache the ${options.name} API snapshot`,
                        cause
                      })
                    )
                  )
                }
                return snapshot
              }),
            () => removeWorktree(options.repoRoot, worktree)
          )
        }))
      })

      const prepareSnapshot = (options: PrepareSnapshotOptions): Effect.Effect<ApiSnapshot, ApiDiffError> =>
        prepareSnapshotInternal(options).pipe(
          Effect.mapError((cause) =>
            isApiDiffError(cause)
              ? cause
              : new ApiDiffError({
                message: `Could not prepare the ${options.name} API snapshot`,
                cause
              })
          )
        )

      return Worktrees.of({
        prepareSnapshot,
        resolveRef
      })
    })
  )

  static readonly layer = this.layerNoDependencies.pipe(
    Layer.provide(Snapshotter.layer)
  )
}
