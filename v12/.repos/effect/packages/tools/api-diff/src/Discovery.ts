import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import type * as PlatformError from "effect/PlatformError"
import * as Schema from "effect/Schema"
import { ApiDiffError } from "./Error.ts"
import type { Entrypoint } from "./Model.ts"

const PackageManifest = Schema.Struct({
  name: Schema.optional(Schema.String),
  private: Schema.optional(Schema.Boolean),
  exports: Schema.optional(Schema.Unknown),
  publishConfig: Schema.optional(Schema.Struct({
    exports: Schema.optional(Schema.Unknown)
  }))
})

type PackageManifest = typeof PackageManifest.Type

interface PackageInfo {
  readonly name: string
  readonly root: string
  readonly manifest: PackageManifest
  readonly exports: unknown
}

export interface DiscoveryResult {
  readonly entrypoints: ReadonlyArray<Entrypoint>
  readonly missing: ReadonlyArray<string>
}

const decodePackageManifest = Schema.decodeUnknownEffect(Schema.fromJsonString(PackageManifest))

const exportedTarget = (value: unknown): string | null | undefined => {
  if (value === null || typeof value === "string") {
    return value
  }
  if (typeof value !== "object" || value === null) {
    return undefined
  }
  for (const condition of ["types", "import", "default", "node", "browser"]) {
    const target = exportedTarget(Reflect.get(value, condition))
    if (target !== undefined) {
      return target
    }
  }
  return undefined
}

const matchPattern = (pattern: string, value: string): string | undefined => {
  const star = pattern.indexOf("*")
  if (star === -1) {
    return pattern === value ? "" : undefined
  }
  const prefix = pattern.slice(0, star)
  const suffix = pattern.slice(star + 1)
  return value.startsWith(prefix) && value.endsWith(suffix)
    ? value.slice(prefix.length, value.length - suffix.length)
    : undefined
}

export class Discovery extends Context.Service<Discovery, {
  readonly discoverEntrypoints: (
    repoRoot: string,
    requestedModules?: ReadonlyArray<string>
  ) => Effect.Effect<DiscoveryResult, ApiDiffError>
}>()("@effect/api-diff/Discovery") {
  static readonly layer = Layer.effect(
    Discovery,
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path

      const readManifest = Effect.fnUntraced(function*(location: string) {
        const source = yield* fs.readFileString(location)
        return yield* decodePackageManifest(source)
      })

      const walk = Effect.fnUntraced(function*(
        root: string,
        predicate: (location: string) => boolean
      ) {
        const output: Array<string> = []
        const visit: (directory: string) => Effect.Effect<void, PlatformError.PlatformError> = Effect.fnUntraced(
          function*(directory: string) {
            const entries = yield* fs.readDirectory(directory)
            for (const entry of entries) {
              if (entry === "node_modules" || entry === ".git") {
                continue
              }
              const location = path.join(directory, entry)
              const info = yield* fs.stat(location)
              if (info.type === "Directory") {
                yield* visit(location)
              } else if (predicate(location)) {
                output.push(location)
              }
            }
          }
        )
        if (yield* fs.exists(root)) {
          yield* visit(root)
        }
        return output.sort()
      })

      const packagesIn = Effect.fnUntraced(function*(repoRoot: string) {
        const manifestPaths = yield* walk(
          path.join(repoRoot, "packages"),
          (location) => location.endsWith(`${path.sep}package.json`)
        )
        const packages: Array<PackageInfo> = []
        for (const manifestPath of manifestPaths) {
          const sourceRoot = path.dirname(manifestPath)
          if (
            path.basename(sourceRoot) === "dist" &&
            (yield* fs.exists(path.join(path.dirname(sourceRoot), "package.json")))
          ) {
            continue
          }
          const packedPath = path.join(sourceRoot, "dist", "package.json")
          const packed = yield* fs.exists(packedPath)
          const manifest = yield* readManifest(packed ? packedPath : manifestPath)
          if (manifest.name === undefined || manifest.private === true) {
            continue
          }
          packages.push({
            name: manifest.name,
            root: packed ? path.join(sourceRoot, "dist") : sourceRoot,
            exports: packed ? manifest.exports : (manifest.publishConfig?.exports ?? manifest.exports),
            manifest
          })
        }
        return packages.sort((left, right) => right.name.length - left.name.length)
      })

      const targetToDeclaration = (packageInfo: PackageInfo, target: string): string | undefined => {
        const relativeTarget = target.replace(/^\.\//, "")
        const declaration = relativeTarget.endsWith(".d.ts")
          ? relativeTarget
          : relativeTarget.replace(/\.(?:mjs|cjs|js|mts|cts|ts)$/, ".d.ts")
        return declaration.endsWith(".d.ts") ? path.resolve(packageInfo.root, declaration) : undefined
      }

      const expandPattern = Effect.fnUntraced(function*(
        packageInfo: PackageInfo,
        keyPattern: string,
        targetPattern: string,
        requested: ReadonlySet<string> | undefined,
        exportsMap: Readonly<Record<string, unknown>>
      ) {
        const candidates = yield* walk(packageInfo.root, (location) => location.endsWith(".d.ts"))
        const targetNormalized = targetPattern.endsWith(".d.ts")
          ? targetPattern
          : targetPattern.replace(/\.(?:mjs|cjs|js|mts|cts|ts)$/, ".d.ts")
        const entries: Array<Entrypoint> = []
        for (const declarationFile of candidates) {
          const relativeFile = `./${path.relative(packageInfo.root, declarationFile).split(path.sep).join("/")}`
          const capture = matchPattern(targetNormalized, relativeFile)
          if (capture === undefined) {
            continue
          }
          const key = keyPattern.replace("*", capture)
          const module = key === "." ? packageInfo.name : `${packageInfo.name}${key.slice(1)}`
          const excluded = Object.entries(exportsMap).some(([excludedKey, excludedTarget]) =>
            excludedTarget === null && matchPattern(excludedKey, key) !== undefined
          )
          if (!excluded && (requested === undefined || requested.has(module))) {
            entries.push({ packageName: packageInfo.name, module, declarationFile })
          }
        }
        return entries
      })

      const discoverEntrypointsInternal = Effect.fnUntraced(function*(
        repoRoot: string,
        requestedModules?: ReadonlyArray<string>
      ) {
        const packages = yield* packagesIn(repoRoot)
        const requested = requestedModules === undefined ? undefined : new Set(requestedModules)
        const output = new Map<string, Entrypoint>()

        for (const packageInfo of packages) {
          if (typeof packageInfo.exports !== "object" || packageInfo.exports === null) {
            continue
          }
          const exportsMap = packageInfo.exports as Record<string, unknown>
          for (const [keyPattern, rawTarget] of Object.entries(exportsMap)) {
            const target = exportedTarget(rawTarget)
            if (
              !keyPattern.includes("*") &&
              typeof target === "string" &&
              (requested === undefined || requested.has(
                keyPattern === "." ? packageInfo.name : `${packageInfo.name}${keyPattern.slice(1)}`
              ))
            ) {
              const module = keyPattern === "." ? packageInfo.name : `${packageInfo.name}${keyPattern.slice(1)}`
              const declarationFile = targetToDeclaration(packageInfo, target)
              if (
                declarationFile !== undefined &&
                !output.has(module) &&
                (yield* fs.exists(declarationFile)) &&
                (yield* fs.stat(declarationFile)).type === "File"
              ) {
                output.set(module, { packageName: packageInfo.name, module, declarationFile })
              }
            }
            if (keyPattern.includes("*") && typeof target === "string" && target.includes("*")) {
              for (const entry of yield* expandPattern(packageInfo, keyPattern, target, requested, exportsMap)) {
                if (!output.has(entry.module)) {
                  output.set(entry.module, entry)
                }
              }
            }
          }
        }

        return {
          entrypoints: [...output.values()].sort((left, right) => left.module.localeCompare(right.module)),
          missing: requestedModules?.filter((module) => !output.has(module)).sort() ?? []
        }
      })

      const discoverEntrypoints = (
        repoRoot: string,
        requestedModules?: ReadonlyArray<string>
      ): Effect.Effect<DiscoveryResult, ApiDiffError> =>
        discoverEntrypointsInternal(repoRoot, requestedModules).pipe(
          Effect.mapError((cause) =>
            new ApiDiffError({
              message: `Could not discover API entrypoints in ${repoRoot}`,
              cause
            })
          )
        )

      return Discovery.of({ discoverEntrypoints })
    })
  )
}
