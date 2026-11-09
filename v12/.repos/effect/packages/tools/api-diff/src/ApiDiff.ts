import * as Console from "effect/Console"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import { loadAnnotations } from "./Annotations.ts"
import { diffSnapshots } from "./Diff.ts"
import { ApiDiffError, isApiDiffError } from "./Error.ts"
import { prettyJson } from "./Json.ts"
import {
  extractImportMapSections,
  markdownSafetyIssues,
  renderMigrationDocument,
  renderMissingAnnotations,
  unannotatedApiIds,
  unannotatedModuleIds
} from "./MigrationDoc.ts"
import { renderMarkdownReport } from "./Report.ts"
import { Worktrees } from "./Worktrees.ts"

export interface ApiDiffOptions {
  readonly baseRef: string
  readonly headRef: string
  readonly output?: string | undefined
  readonly writeDoc?: string | undefined
  readonly check: boolean
}

export class ApiDiff extends Context.Service<ApiDiff, {
  readonly run: (options: ApiDiffOptions) => Effect.Effect<void, ApiDiffError>
}>()("@effect/api-diff/ApiDiff") {
  static readonly layerNoDependencies = Layer.effect(
    ApiDiff,
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const worktrees = yield* Worktrees

      const absolute = (repoRoot: string, location: string): string =>
        path.isAbsolute(location) ? location : path.resolve(repoRoot, location)

      const findRepoRoot = Effect.fnUntraced(function*() {
        let current = path.resolve()
        while (true) {
          if (
            (yield* fs.exists(path.join(current, ".git"))) ||
            (yield* fs.exists(path.join(current, "pnpm-workspace.yaml")))
          ) {
            return current
          }
          const parent = path.dirname(current)
          if (parent === current) {
            return yield* new ApiDiffError({
              message: `Could not locate repository root from ${path.resolve()}`
            })
          }
          current = parent
        }
      })

      const runInternal = Effect.fnUntraced(function*(options: ApiDiffOptions) {
        const repoRoot = yield* findRepoRoot()
        if (options.output === undefined && options.writeDoc === undefined && !options.check) {
          return yield* new ApiDiffError({ message: "Specify --output, --write-doc, or --check" })
        }

        const baseSha = yield* worktrees.resolveRef(repoRoot, options.baseRef)
        const headSha = yield* (options.headRef === "main"
          ? worktrees.resolveRef(repoRoot, "origin/main").pipe(
            Effect.catch(() => worktrees.resolveRef(repoRoot, options.headRef))
          )
          : worktrees.resolveRef(repoRoot, options.headRef))
        const toolRoot = path.join(repoRoot, "tmp", "api-diff")
        const cacheRoot = path.join(toolRoot, "cache")
        const worktreesRoot = path.join(toolRoot, "worktrees")
        yield* Console.log(
          `Base ${options.baseRef}: ${baseSha}\nHead ${options.headRef}: ${headSha}`
        )
        const base = yield* worktrees.prepareSnapshot({
          repoRoot,
          cacheRoot,
          worktreesRoot,
          name: "base",
          ref: options.baseRef,
          sha: baseSha
        })
        const head = yield* worktrees.prepareSnapshot({
          repoRoot,
          cacheRoot,
          worktreesRoot,
          name: "head",
          ref: options.headRef,
          sha: headSha
        })
        const diff = diffSnapshots(base, head)

        if (options.output !== undefined) {
          const output = absolute(repoRoot, options.output)
          yield* fs.makeDirectory(output, { recursive: true })
          yield* fs.writeFileString(path.join(output, "base.snapshot.json"), prettyJson(base))
          yield* fs.writeFileString(path.join(output, "head.snapshot.json"), prettyJson(head))
          yield* fs.writeFileString(path.join(output, "diff.json"), prettyJson(diff))
          yield* fs.writeFileString(path.join(output, "report.md"), renderMarkdownReport(diff))
          yield* Console.log(`Wrote ${path.relative(repoRoot, output)} (${diff.changes.length} changes)`)
        }

        if (options.writeDoc !== undefined || options.check) {
          const annotations = yield* loadAnnotations(path.join(repoRoot, "migration", "annotations")).pipe(
            Effect.provideService(FileSystem.FileSystem, fs),
            Effect.provideService(Path.Path, path)
          )
          const documentPath = options.writeDoc === undefined
            ? path.join(repoRoot, "migration", "v3-to-v4.md")
            : absolute(repoRoot, options.writeDoc)
          const existing = (yield* fs.exists(documentPath)) ? yield* fs.readFileString(documentPath) : ""
          const importMapSections = extractImportMapSections(existing)
          let documentForCheck = existing
          if (options.writeDoc !== undefined) {
            const document = renderMigrationDocument(diff, annotations, importMapSections)
            const unsafeMarkdown = markdownSafetyIssues(document)
            if (unsafeMarkdown.length > 0) {
              return yield* new ApiDiffError({
                message: `Generated migration document has unsafe Markdown:\n${unsafeMarkdown.join("\n")}`
              })
            }
            documentForCheck = document
            yield* fs.makeDirectory(path.dirname(documentPath), { recursive: true })
            yield* fs.writeFileString(documentPath, document)
            yield* Console.log(`Wrote ${path.relative(repoRoot, documentPath)} (${diff.changes.length} changes)`)
          }
          if (options.check) {
            const unsafeMarkdown = markdownSafetyIssues(documentForCheck)
            if (unsafeMarkdown.length > 0) {
              return yield* new ApiDiffError({
                message: `Migration document has unsafe Markdown:\n${unsafeMarkdown.join("\n")}`
              })
            }
            const missingApis = unannotatedApiIds(diff, annotations, importMapSections)
            const missingModules = unannotatedModuleIds(diff, annotations, importMapSections)
            yield* Console.log(renderMissingAnnotations(diff, annotations, importMapSections).trimEnd())
            if (missingApis.size > 0 || missingModules.length > 0) {
              return yield* new ApiDiffError({
                message: `${missingApis.size} API groups and ${missingModules.length} modules need migration guidance`
              })
            }
          }
        }
      })

      const run = (options: ApiDiffOptions): Effect.Effect<void, ApiDiffError> =>
        runInternal(options).pipe(
          Effect.mapError((cause) =>
            isApiDiffError(cause)
              ? cause
              : new ApiDiffError({
                message: "API diff failed",
                cause
              })
          )
        )

      return ApiDiff.of({ run })
    })
  )

  static readonly layer = this.layerNoDependencies.pipe(
    Layer.provide(Worktrees.layer)
  )
}
