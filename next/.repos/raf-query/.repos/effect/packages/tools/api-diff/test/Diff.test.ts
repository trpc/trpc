import { diffSnapshots } from "@effect/api-diff/Diff"
import type { ApiDiff, ApiEntity, ApiSnapshot, DeclarationModel } from "@effect/api-diff/Model"
import { renderMarkdownReport } from "@effect/api-diff/Report"
import { Snapshotter } from "@effect/api-diff/Snapshot"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import { writeFixturePackage } from "./utils.ts"

const MainLayer = Snapshotter.layer.pipe(Layer.provideMerge(NodeServices.layer))

const entity = (
  module: string,
  name: string,
  declaration: DeclarationModel,
  hash: string
): ApiEntity => ({
  id: `${module}#${name}#value`,
  packageName: module.split("/")[0]!,
  module,
  path: [name],
  bucket: "value",
  declarationKind: declaration.kind,
  importRoutes: [{ module, path: [name] }],
  declarations: [declaration],
  displaySignature: `declare const ${name}: unknown`,
  fingerprint: hash,
  documentation: { stability: "stable" },
  source: { file: `${name}.d.ts`, line: 1, column: 1 }
})

const snapshot = (ref: string, entities: ReadonlyArray<ApiEntity>): ApiSnapshot => ({
  version: 1,
  compiler: { name: "typescript", version: "fixture" },
  ref,
  sha: ref.repeat(40).slice(0, 40),
  packages: ["old", "new"],
  entrypoints: [],
  entities,
  diagnostics: []
})

describe("snapshot diff", () => {
  it.effect("detects optional class member changes", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const snapshotter = yield* Snapshotter
      const extract = Effect.fnUntraced(function*(ref: string, source: string) {
        const repoRoot = yield* fs.makeTempDirectoryScoped({ prefix: "api-diff-optional-class-" })
        yield* writeFixturePackage(repoRoot, { "Api.d.ts": source }, { "./Api": { types: "./Api.d.ts" } })
        return yield* snapshotter.extract({
          repoRoot,
          ref,
          sha: "0".repeat(40),
          modules: ["@fixture/sample/Api"]
        })
      })
      const base = yield* extract("base", "export declare class Client { value: string }\n")
      const head = yield* extract("head", "export declare class Client { value?: string }\n")
      const diff = diffSnapshots(base, head)

      for (const bucket of ["type", "value"]) {
        const id = `@fixture/sample/Api#Client#${bucket}`
        const baseEntity = base.entities.find((entity) => entity.id === id)
        const headEntity = head.entities.find((entity) => entity.id === id)
        assert(baseEntity !== undefined)
        assert(headEntity !== undefined)
        assert.notStrictEqual(baseEntity.fingerprint, headEntity.fingerprint)
        assert(diff.changes.some((change) =>
          change.classification === "member-changed" &&
          change.baseApiId === id &&
          change.headApiId === id
        ))
      }
    }).pipe(Effect.provide(MainLayer)))

  it.effect("detects changes between numeric and string literal types", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const snapshotter = yield* Snapshotter
      const extract = (repoRoot: string, ref: string) =>
        snapshotter.extract({
          repoRoot,
          ref,
          sha: ref.repeat(40),
          modules: ["@fixture/sample/Value"]
        })
      const baseRoot = yield* fs.makeTempDirectoryScoped({ prefix: "api-diff-literal-base-" })
      const headRoot = yield* fs.makeTempDirectoryScoped({ prefix: "api-diff-literal-head-" })
      yield* writeFixturePackage(baseRoot, { "Value.d.ts": "export type Value = 1\n" })
      yield* writeFixturePackage(headRoot, { "Value.d.ts": "export type Value = \"1\"\n" })

      assert.deepStrictEqual(
        diffSnapshots(yield* extract(baseRoot, "a"), yield* extract(headRoot, "b")).changes.map((change) =>
          change.classification
        ),
        ["structural-change"]
      )
    }).pipe(Effect.provide(MainLayer)))

  it("matches renames, classifies signature changes, and separates suggestions", () => {
    const base = snapshot("a", [
      entity("old/A", "changed", {
        kind: "function",
        name: "changed",
        parameters: [{ name: "value", type: { kind: "primitive", name: "string" }, optional: false, rest: false }],
        returnType: { kind: "primitive", name: "string" }
      }, "before"),
      entity("old/A", "similarName", {
        kind: "variable",
        name: "similarName",
        type: { kind: "primitive", name: "string" }
      }, "x"),
      entity(
        "old/A",
        "removed",
        { kind: "variable", name: "removed", type: { kind: "primitive", name: "string" } },
        "r"
      )
    ])
    const head = snapshot("b", [
      entity("old/A", "changed", {
        kind: "function",
        name: "changed",
        parameters: [
          { name: "value", type: { kind: "primitive", name: "string" }, optional: false, rest: false },
          { name: "count", type: { kind: "primitive", name: "number" }, optional: true, rest: false }
        ],
        returnType: { kind: "primitive", name: "number" }
      }, "different"),
      entity("old/A", "similarNames", {
        kind: "variable",
        name: "similarNames",
        type: { kind: "primitive", name: "number" }
      }, "y"),
      entity("old/A", "added", { kind: "variable", name: "added", type: { kind: "primitive", name: "string" } }, "a")
    ])
    const diff = diffSnapshots(base, head)
    assert(diff.changes.some((change) => change.classification === "parameter-added"))
    assert(diff.changes.some((change) => change.classification === "return-type-changed"))
    assert(diff.changes.some((change) => change.baseApiId?.includes("similarName") && !change.authoritative))
    assert(
      diff.changes.some((change) =>
        change.classification === "api-removed" && change.baseApiId?.includes("similarName")
      )
    )
    assert(
      diff.changes.some((change) => change.classification === "api-added" && change.headApiId?.includes("similarNames"))
    )
    const report = renderMarkdownReport(diff)
    assert(report.includes("Suggested replacements for removed APIs"))
    assert(report.includes(base.sha))
    assert.deepStrictEqual(diff, diffSnapshots(base, head))
  })

  it("suggests replacements across modules and preserves class facets", () => {
    const variable = (name: string): DeclarationModel => ({
      kind: "variable",
      name,
      type: { kind: "primitive", name: "unknown" }
    })
    const serviceInterface = (name: string, extraMember?: string): DeclarationModel => ({
      kind: "interface",
      name,
      members: [
        {
          kind: "method",
          name: "context",
          parameters: [],
          returnType: { kind: "primitive", name: "unknown" }
        },
        {
          kind: "method",
          name: "of",
          parameters: [],
          returnType: { kind: "primitive", name: "unknown" }
        },
        ...(extraMember === undefined
          ? []
          : [{
            kind: "method",
            name: extraMember,
            parameters: [],
            returnType: { kind: "primitive", name: "unknown" }
          }])
      ]
    })
    const withBucket = (api: ApiEntity, bucket: ApiEntity["bucket"]): ApiEntity => ({
      ...api,
      id: `${api.module}#${api.path.join(".")}#${bucket}`,
      bucket
    })
    const effectService = {
      ...entity("effect/Effect", "Service", variable("Service"), "effect-service"),
      documentation: {
        summary: "Creates a Context Tag and Layer for a service.",
        stability: "stable" as const
      }
    }
    const contextTagValue = entity("effect/Context", "Tag", variable("Tag"), "tag-value")
    const contextTagType = withBucket(
      entity("effect/Context", "Tag", serviceInterface("Tag"), "tag-type"),
      "type"
    )
    const contextServiceValue = entity("effect/Context", "Service", variable("Service"), "service-value")
    const contextServiceType = withBucket(
      entity("effect/Context", "Service", serviceInterface("Service", "use"), "service-type"),
      "type"
    )
    const layerMapService = entity("effect/LayerMap", "Service", variable("Service"), "layer-map-service")
    const diff = diffSnapshots(
      snapshot("a", [effectService, contextTagType, contextTagValue]),
      snapshot("b", [contextServiceType, contextServiceValue, layerMapService])
    )
    const suggestions = diff.changes.filter((change) => !change.authoritative)
    assert(suggestions.some((change) =>
      change.baseApiId === "effect/Effect#Service#value" &&
      change.headApiId === "effect/Context#Service#value"
    ))
    assert(suggestions.some((change) =>
      change.baseApiId === "effect/Context#Tag#type" &&
      change.headApiId === "effect/Context#Service#type"
    ))
    assert(suggestions.some((change) =>
      change.baseApiId === "effect/Context#Tag#value" &&
      change.headApiId === "effect/Context#Service#value"
    ))
    assert(!suggestions.some((change) => change.headApiId === "effect/LayerMap#Service#value"))
    assert.strictEqual(diff.changes.filter((change) => change.classification === "api-removed").length, 3)
    assert.strictEqual(diff.changes.filter((change) => change.classification === "api-added").length, 3)
  })

  it("classifies overload and parameter reordering", () => {
    const signature = (name: string, parameters: ReadonlyArray<"left" | "right">): DeclarationModel => ({
      kind: "function",
      name,
      parameters: parameters.map((parameter) => ({
        name: parameter,
        type: { kind: "primitive", name: "string" },
        optional: false,
        rest: false
      })),
      returnType: { kind: "primitive", name: "string" }
    })
    const before = entity("old/A", "ordered", signature("ordered", ["left", "right"]), "before")
    const after = entity("old/A", "ordered", signature("ordered", ["right", "left"]), "after")
    const diff = diffSnapshots(
      snapshot("a", [before]),
      snapshot("b", [after])
    )
    assert(diff.changes.some((change) => change.classification === "parameter-reordered"))
  })

  it("groups package and module changes by their delta names", () => {
    const report = renderMarkdownReport(
      {
        version: 1,
        base: { ref: "a", sha: "a".repeat(40) },
        head: { ref: "b", sha: "b".repeat(40) },
        changes: [
          {
            id: "package-removed",
            classification: "package-removed",
            confidence: 1,
            delta: { packageName: "@effect/old" },
            authoritative: true
          },
          {
            id: "module-added",
            classification: "module-added",
            confidence: 1,
            delta: { to: ["effect/New"] },
            authoritative: true
          }
        ]
      } satisfies ApiDiff
    )
    assert(report.includes("| @effect/old | @effect/old | 1 |"))
    assert(report.includes("| stable | effect/New | 1 |"))
    assert(!report.includes("<package>"))
  })
})
