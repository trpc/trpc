/**
 * The `graphqlgen --watch` loop.
 *
 * The loop runs over the event streams `options.watch` returns, so tests can
 * inject events and the CLI plugs in `FileSystem.watch`.
 *
 * @internal
 */
import * as Cause from "effect/Cause"
import * as Console from "effect/Console"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as PlatformError from "effect/PlatformError"
import * as Queue from "effect/Queue"
import * as Result from "effect/Result"
import * as Stream from "effect/Stream"
import * as Cli from "./Cli.ts"
import * as Generate from "./Generate.ts"
import * as Glob from "./Glob.ts"

/** How long the loop waits after the last relevant event before it regenerates. */
const debounce = "50 millis"

/**
 * Generates at startup and 50 ms after the last relevant event. Watches the
 * config, schema and document glob roots; generated files are ignored.
 * Successful cycles write changed files, delete stale outputs and log counts.
 * Errors print diagnostics without writing. Unmapped-scalar warnings are
 * printed only when their set changes. Invalid config edits keep the previous
 * config; only a startup config failure ends the loop.
 *
 * `configPath` is absolute. `watch(path, kind)` uses `FileSystem.watch`
 * semantics: event paths are relative to the watched directory or a watched
 * file's parent. Missing roots are watched through their first missing
 * directory. Ended or failed watchers are replaced on the next cycle.
 *
 * Generation waits for every watch to acknowledge installation via `onReady`.
 * Events are buffered while installation and generation are in progress.
 * Targets are reconciled after each cycle without polling.
 */
export const run: (options: {
  readonly configPath: string
  /** Call `onReady` only after installation, when the stream can buffer events. */
  readonly watch: (
    path: string,
    kind: "file" | "directory",
    onReady: () => void
  ) => Stream.Stream<FileSystem.WatchEvent, PlatformError.PlatformError>
}) => Effect.Effect<never, Cli.ConfigLoadError, FileSystem.FileSystem | Path.Path> = Effect.fnUntraced(
  function*(options) {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const configPath = path.resolve(options.configPath)
    const cwd = path.dirname(configPath)
    const cache = Generate.makeCache()

    /** The config file's mtime, used to spot edits and to bust the import cache. */
    const configVersion = fs.stat(configPath).pipe(
      Effect.map((info) => Option.getOrElse(Option.map(info.mtime, (date) => date.getTime()), () => 0)),
      Effect.orElseSucceed(() => undefined)
    )

    const initialVersion = yield* configVersion
    const initialConfig = yield* Cli.loadConfig(configPath, initialVersion)
    const state = {
      config: initialConfig,
      configVersion: initialVersion,
      schemaPath: path.resolve(cwd, initialConfig.schema),
      globs: initialConfig.documents.map(Glob.make),
      /** Files the last successful cycle generated or deleted; events for them are ignored. */
      outputs: new Set<string>(),
      /** The first missing directory of each missing glob root; its creation is relevant. */
      pending: new Set<string>(),
      /** The formatted warnings the last successful cycle printed or kept quiet about. */
      warnings: new Set<string>()
    }

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    const isRelevant = (absolute: string): boolean => {
      if (absolute === configPath || absolute === state.schemaPath || state.pending.has(absolute)) return true
      if (state.outputs.has(absolute)) return false
      const relative = path.relative(cwd, absolute).split(path.sep).join("/")
      const segments = relative.split("/")
      const inside = segments.slice(segments.findIndex((segment) => segment !== ".."))
      // The generator never reads documents under node_modules or dot-directories.
      if (inside.some(Glob.isSkipped)) return false
      return state.globs.some((glob) => glob.matches(relative))
    }

    const events = yield* Queue.unbounded<string>()

    interface Target {
      /** `pending` is the first missing directory on the way to a glob root. */
      readonly kind: "file" | "tree" | "pending"
      readonly path: string
      /** Event paths are relative to this directory. */
      readonly base: string
    }

    const exists = (file: string) => fs.exists(file).pipe(Effect.orElseSucceed(() => false))

    /** `file` itself when its directory exists, otherwise the first missing directory above it. */
    const firstMissing = Effect.fnUntraced(function*(file: string) {
      let missing = file
      while (true) {
        const parent = path.dirname(missing)
        if (parent === missing || (yield* exists(parent))) return missing
        missing = parent
      }
    })

    /**
     * The config file, the schema file and each `documents` glob root. Every
     * target's `base` directory exists, so a watch only ends when something
     * was deleted.
     */
    const targets = Effect.gen(function*() {
      const found = new Map<string, Target>()
      for (const file of [configPath, state.schemaPath]) {
        const watched = yield* firstMissing(file)
        found.set(watched, { kind: watched === file ? "file" : "pending", path: watched, base: path.dirname(watched) })
      }
      for (const glob of state.globs) {
        const directory = path.join(cwd, glob.root)
        if (glob.skipped || found.get(directory)?.kind === "tree") continue
        if (yield* exists(directory)) {
          found.set(directory, { kind: "tree", path: directory, base: directory })
        } else {
          const missing = yield* firstMissing(directory)
          if (!found.has(missing)) found.set(missing, { kind: "pending", path: missing, base: path.dirname(missing) })
        }
      }
      return Array.from(found.values())
    })

    /** Set when a watch stream ended or failed, so the next `subscribe` starts over. */
    let stale = false

    const watchTarget = (target: Target, ready: Deferred.Deferred<void>) =>
      options.watch(target.path, target.kind === "tree" ? "directory" : "file", () => {
        Deferred.doneUnsafe(ready, Effect.void)
      }).pipe(
        Stream.runForEach((event) => {
          const absolute = path.resolve(target.base, event.path)
          return isRelevant(absolute) ? Queue.offer(events, absolute) : Effect.void
        }),
        Effect.matchEffect({
          onFailure: (error) =>
            Effect.andThen(
              Effect.sync(() => (stale = true)),
              Console.error(`error: could not watch ${Cli.displayPath(path, target.path)}: ${error.message}`)
            ),
          onSuccess: () => Effect.andThen(Effect.sync(() => (stale = true)), Queue.offer(events, target.path))
        }),
        // A failed or ended stream must not leave subscription waiting forever.
        Effect.ensuring(Deferred.succeed(ready, undefined))
      )

    let watching: { readonly key: string; readonly fiber: Fiber.Fiber<void> } | undefined
    const targetKey = (current: ReadonlyArray<Target>) =>
      current.map((target) => `${target.kind}:${target.path}`).join("\0")
    /** Watches the current targets, replacing the previous watchers when they changed or one stopped. */
    const subscribe = Effect.gen(function*() {
      const current = yield* targets
      const key = targetKey(current)
      if (!stale && watching?.key === key) return
      if (watching !== undefined) yield* Fiber.interrupt(watching.fiber)
      stale = false
      state.pending = new Set(current.filter((target) => target.kind === "pending").map((target) => target.path))
      // Call watch on the loop fiber; only consumption of its streams is forked.
      const ready = yield* Effect.forEach(current, () => Deferred.make<void>())
      const streams = current.map((target, index) => watchTarget(target, ready[index]))
      const fiber = yield* Effect.all(streams, { concurrency: "unbounded", discard: true }).pipe(
        Effect.forkChild
      )
      watching = { key, fiber }
      yield* Effect.forEach(ready, Deferred.await, { concurrency: "unbounded", discard: true })
    })

    /** Reconcile roots that appeared or disappeared during this cycle, without polling. */
    const reconcile = Effect.gen(function*() {
      if (targetKey(yield* targets) !== watching?.key) yield* Queue.offer(events, state.schemaPath)
    })

    // -------------------------------------------------------------------------
    // Cycles
    // -------------------------------------------------------------------------

    const generate = Effect.gen(function*() {
      const generated = yield* Effect.result(Generate.generate(state.config, { cwd, cache }))
      if (Result.isFailure(generated)) {
        return yield* Console.error(`error: ${generated.failure.message}`)
      }
      const result = generated.success
      const warnings = new Set<string>()
      let errors = 0
      for (const diagnostic of result.diagnostics) {
        const formatted = Cli.formatDiagnostic(path, cwd, diagnostic)
        if (diagnostic.severity === "error") {
          errors++
          yield* Console.error(formatted)
        } else {
          warnings.add(formatted)
          if (!state.warnings.has(formatted)) yield* Console.error(formatted)
        }
      }
      if (errors > 0) {
        return yield* Console.error(Cli.errorSummary(errors))
      }
      state.warnings = warnings
      const written = yield* Effect.result(
        Cli.planChanges(result).pipe(Effect.tap(Cli.writeChanges))
      )
      if (Result.isFailure(written)) {
        return yield* Console.error(written.failure.message)
      }
      const changes = written.success
      state.outputs = new Set([...result.files.map((file) => file.path), ...result.deletes])
      const count = changes.creates.length + changes.updates.length
      yield* Console.log(`regenerated ${count} ${count === 1 ? "file" : "files"}, deleted ${changes.deletes.length}`)
    })

    /** Installs the watches, then regenerates and reconciles the targets. */
    const refresh = Effect.gen(function*() {
      yield* subscribe
      yield* generate
      yield* reconcile
    })

    /**
     * Reloads the config when its mtime changed, then refreshes. A config that
     * fails to load is reported and the previous one kept; the cycle still
     * regenerates when something besides the config changed.
     */
    const cycle = Effect.fnUntraced(function*(changed: ReadonlySet<string>) {
      const version = yield* configVersion
      if (version !== state.configVersion) {
        state.configVersion = version
        const loaded = yield* Effect.result(Cli.loadConfig(configPath, version))
        if (Result.isFailure(loaded)) {
          yield* Console.error(loaded.failure.message)
          if (!Array.from(changed).some((file) => file !== configPath)) return
        } else {
          state.config = loaded.success
          state.schemaPath = path.resolve(cwd, loaded.success.schema)
          state.globs = loaded.success.documents.map(Glob.make)
        }
      }
      yield* refresh
    })

    yield* refresh

    const pending = new Set<string>()
    yield* Stream.fromQueue(events).pipe(
      Stream.tap((file) => Effect.sync(() => pending.add(file))),
      Stream.debounce(debounce),
      Stream.runForEach(() =>
        Effect.suspend(() => {
          const changed = new Set(pending)
          pending.clear()
          return cycle(changed)
        })
      )
    )
    return yield* Effect.never
  }
)

// -----------------------------------------------------------------------------
// FileSystem.watch
// -----------------------------------------------------------------------------

/**
 * The `watch` option of {@link run} backed by `FileSystem.watch`, for the
 * CLI.
 *
 * A file is watched through its directory, so a file that doesn't exist yet,
 * or that an editor saves by renaming a new file over it, is still seen.
 *
 * A directory is watched one directory at a time rather than with
 * `recursive: true`: Node's recursive watcher on Linux keeps following the
 * old file after a rename-over save and misses every later edit. New
 * subdirectories are picked up as they appear, with a `Create` event for each
 * file already in them. `node_modules` and dot-directories are skipped.
 *
 * The stream ends when the watched directory is deleted, and fails when
 * watching fails for any other reason, e.g. when the system runs out of
 * inotify watches.
 */
export const fileSystemWatch = (fs: FileSystem.FileSystem, path: Path.Path) =>
(
  target: string,
  kind: "file" | "directory",
  onReady: () => void
): Stream.Stream<FileSystem.WatchEvent, PlatformError.PlatformError> =>
  kind === "file"
    ? watchDirectory(fs, path.dirname(target), onReady).pipe(
      Stream.filter((event) => event.path === path.basename(target))
    )
    : watchTree(fs, path, target, onReady)

/**
 * `FileSystem.watch` on one directory, ending when the directory is deleted.
 * Node doesn't end the watch then: it reports a rename of the directory's own
 * name and goes quiet. A failure while the directory still exists is passed
 * on, including a defect: Node throws `EACCES` and `ENOSPC` synchronously from
 * `fs.watch`.
 */
const watchDirectory = (
  fs: FileSystem.FileSystem,
  directory: string,
  onReady: () => void
): Stream.Stream<FileSystem.WatchEvent, PlatformError.PlatformError> => {
  const gone = fs.exists(directory).pipe(
    Effect.map((exists) => !exists),
    Effect.orElseSucceed(() => false)
  )
  return fs.watch(directory, { onReady }).pipe(
    Stream.takeUntilEffect((event) => event._tag === "Remove" ? gone : Effect.succeed(false)),
    Stream.catchCause((cause) => {
      if (Cause.hasInterruptsOnly(cause)) return Stream.failCause(cause)
      const failure = Cause.squash(cause)
      const error = PlatformError.isPlatformError(failure) ? failure : PlatformError.systemError({
        _tag: "Unknown",
        module: "FileSystem",
        method: "watch",
        pathOrDescriptor: directory,
        description: failure instanceof Error ? failure.message : String(failure),
        cause: failure
      })
      return Stream.unwrap(Effect.map(gone, (isGone) => isGone ? Stream.empty : Stream.fail(error)))
    })
  )
}

const watchTree = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
  onReady: () => void
): Stream.Stream<FileSystem.WatchEvent, PlatformError.PlatformError> =>
  Stream.callback<FileSystem.WatchEvent, PlatformError.PlatformError>(Effect.fnUntraced(function*(queue) {
    const scope = yield* Effect.scope
    const watchers = new Map<string, { readonly fiber: Fiber.Fiber<void>; readonly ready: Deferred.Deferred<void> }>()
    const offer = (event: FileSystem.WatchEvent) =>
      Queue.offer(queue, { _tag: event._tag, path: path.relative(root, event.path) })

    /** Visits the subdirectories and files directly under `directory`. */
    const children = Effect.fnUntraced(function*(directory: string) {
      const entries = yield* fs.readDirectory(directory).pipe(Effect.orElseSucceed(() => []))
      const directories: Array<string> = []
      const files: Array<string> = []
      for (const entry of entries) {
        const absolute = path.join(directory, entry)
        const info = yield* fs.stat(absolute).pipe(Effect.option)
        if (Option.isNone(info)) continue
        if (info.value.type === "Directory") {
          if (!Glob.isSkipped(entry)) directories.push(absolute)
        } else {
          files.push(absolute)
        }
      }
      return { directories, files }
    })

    /**
     * Watches `directory` and everything under it; `announce` reports its
     * files as created. Deleting the root ends the stream; a watch that
     * fails takes the whole stream down with it.
     */
    const add: (directory: string, announce: boolean) => Effect.Effect<void> = (directory, announce) =>
      Effect.uninterruptibleMask((restore) =>
        Effect.gen(function*() {
          const existing = watchers.get(directory)
          if (existing !== undefined) return yield* restore(Deferred.await(existing.ready))
          // Share readiness with concurrent discovery of the same subtree.
          const installed = yield* Deferred.make<void>()
          const ready = yield* Deferred.make<void>()
          const fiber = yield* watchDirectory(fs, directory, () => {
            Deferred.doneUnsafe(ready, Effect.void)
          }).pipe(
            Stream.runForEach((event) => handle(directory, event)),
            Effect.matchEffect({
              onFailure: (error) => Queue.fail(queue, error),
              onSuccess: () => directory === root ? Queue.end(queue) : Effect.void
            }),
            Effect.asVoid,
            Effect.ensuring(Deferred.succeed(ready, undefined)),
            Effect.ensuring(Effect.sync(() => watchers.delete(directory))),
            restore,
            Effect.forkIn(scope)
          )
          watchers.set(directory, { fiber, ready: installed })
          // Publishing shared completion and registering its finalizer must be
          // atomic: subtree removal can interrupt this discovery owner.
          yield* restore(Effect.gen(function*() {
            yield* Deferred.await(ready)
            const found = yield* children(directory)
            if (announce) {
              for (const file of found.files) yield* offer({ _tag: "Create", path: file })
            }
            for (const child of found.directories) yield* add(child, announce)
          })).pipe(Effect.ensuring(Deferred.succeed(installed, undefined)))
        })
      )

    /** Stops watching `directory` and everything under it. */
    const remove = (directory: string) =>
      Effect.forEach(
        Array.from(watchers).filter(([watched]) => watched === directory || watched.startsWith(directory + path.sep)),
        ([, { fiber }]) => Fiber.interrupt(fiber),
        { discard: true }
      )

    const handle: (directory: string, event: FileSystem.WatchEvent) => Effect.Effect<void> = Effect.fnUntraced(
      function*(directory, event) {
        const absolute = path.join(directory, event.path)
        yield* offer({ _tag: event._tag, path: absolute })
        if (event._tag === "Remove") return yield* remove(absolute)
        if (event._tag !== "Create" || Glob.isSkipped(path.basename(absolute))) return
        const info = yield* fs.stat(absolute).pipe(Effect.option)
        if (Option.isNone(info) || info.value.type !== "Directory") return
        // A directory deleted and created again may still have its old watcher.
        yield* remove(absolute)
        yield* add(absolute, true)
      }
    )

    yield* add(root, false)
    onReady()
  }))
