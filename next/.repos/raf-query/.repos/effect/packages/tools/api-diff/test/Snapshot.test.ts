import { SnapshotExtractionError, Snapshotter } from "@effect/api-diff/Snapshot"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import { writeFixturePackage } from "./utils.ts"

const MainLayer = Snapshotter.layer.pipe(
  Layer.provideMerge(NodeServices.layer)
)

const source = `
export declare function overloaded<A extends string>(value: A): A
export declare function overloaded(value: number, radix?: number): string

export interface Parent {
  readonly parent: string
}

export interface Service<A = string> extends Parent {
  readonly value?: A
  run(input: A): Promise<A>
  [key: \`item-\${string}\`]: unknown
}

export declare class Client<A> implements Service<A> {
  static readonly version: string
  readonly parent: string
  readonly value?: A
  constructor(value?: A)
  run(input: A): Promise<A>
}

export type Recursive<A> = A | ReadonlyArray<Recursive<A>>
export type Conditional<A> = A extends readonly [infer Head, ...infer Tail] ? Head | Tail[number] : never
export type Mapped<A> = { readonly [K in keyof A as \`get\${Capitalize<string & K>}\`]?: A[K] }
export type Imported = import("node:fs").PathLike
export declare const token: unique symbol

export declare namespace merged {
  const value: string
  interface Options {
    readonly enabled: boolean
  }
}
export declare function merged(value: string): string
`

describe("canonical snapshot", () => {
  it.effect("preserves stability from both current and historical JSDoc tags", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const snapshotter = yield* Snapshotter
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "api-diff-snapshot-" })
      yield* writeFixturePackage(root, {
        "Stability.d.ts": `/** @stability unstable */
export declare const current: string
/** @stability experimental */
export declare const experimental: string
/** @unstable */
export declare const legacy: string
/** A stable declaration. */
export declare const stable: string
`
      })
      const snapshot = yield* snapshotter.extract({
        repoRoot: root,
        ref: "fixture",
        sha: "0000000000000000000000000000000000000000",
        modules: ["@fixture/sample/Stability"]
      })
      const stability = Object.fromEntries(snapshot.entities.map((entity) => [
        entity.path.join("."),
        entity.documentation.stability
      ]))
      assert.deepStrictEqual(stability, {
        current: "unstable",
        experimental: "experimental",
        legacy: "unstable",
        stable: "stable"
      })
    }).pipe(Effect.provide(MainLayer)))

  it.effect("extracts declarations, overloads, namespaces, re-exports, and canonical types deterministically", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const snapshotter = yield* Snapshotter
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "api-diff-snapshot-" })
      yield* writeFixturePackage(root, {
        "index.d.ts": `export * as Foo from "./Foo.js"\n`,
        "Foo.d.ts": source
      })

      const options = {
        repoRoot: root,
        ref: "fixture",
        sha: "0000000000000000000000000000000000000000",
        modules: ["@fixture/sample", "@fixture/sample/Foo"]
      }
      const first = yield* snapshotter.extract(options)
      const second = yield* snapshotter.extract(options)
      assert.deepStrictEqual(first, second)
      assert(first.entities.some((entity) =>
        entity.module === "@fixture/sample/Foo" &&
        entity.path.join(".") === "overloaded" &&
        entity.declarations.length === 2
      ))
      const overloaded = first.entities.find((entity) => entity.id === "@fixture/sample/Foo#overloaded#value")
      assert.deepStrictEqual(overloaded?.importRoutes, [
        { module: "@fixture/sample", path: ["Foo", "overloaded"] },
        { module: "@fixture/sample/Foo", path: ["overloaded"] }
      ])
      const client = first.entities.filter((entity) => entity.path.join(".") === "Client")
      assert.deepStrictEqual(client.map((entity) => entity.bucket), ["type", "value"])
      assert(first.entities.some((entity) => entity.path.join(".") === "merged.Options" && entity.bucket === "type"))
      assert(first.entities.some((entity) => JSON.stringify(entity.declarations).includes("\"kind\":\"conditional\"")))
      assert(first.entities.some((entity) => JSON.stringify(entity.declarations).includes("\"kind\":\"mapped\"")))
      const imported = first.entities.find((entity) => entity.path.join(".") === "Imported")
      assert(imported !== undefined, JSON.stringify(first.entities.map((entity) => entity.id)))
      assert(JSON.stringify(imported.declarations).includes("\"externalPackage\":\"node:fs\""))
    }).pipe(Effect.provide(MainLayer)))

  it.effect("fails rather than silently omitting unsupported public declarations", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const snapshotter = yield* Snapshotter
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "api-diff-snapshot-" })
      yield* writeFixturePackage(root, {
        "Bad.d.ts": `
declare namespace Other {}
export declare namespace Bad {
  export import Alias = Other
}
`
      })
      const failure = yield* Effect.flip(snapshotter.extract({
        repoRoot: root,
        ref: "fixture",
        sha: "0000000000000000000000000000000000000000",
        modules: ["@fixture/sample/Bad"]
      }))
      assert(failure instanceof SnapshotExtractionError)
      assert(failure.diagnostics.some((diagnostic) => diagnostic.code === "unsupported-public-declaration"))
    }).pipe(Effect.provide(MainLayer)))

  it.effect("normalizes union order in structural fingerprints", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const snapshotter = yield* Snapshotter
      const leftRoot = yield* fs.makeTempDirectoryScoped({ prefix: "api-diff-snapshot-" })
      const rightRoot = yield* fs.makeTempDirectoryScoped({ prefix: "api-diff-snapshot-" })
      yield* writeFixturePackage(leftRoot, { "Choice.d.ts": "export type Choice = string | number\n" })
      yield* writeFixturePackage(rightRoot, { "Choice.d.ts": "export type Choice = number | string\n" })
      const extract = (repoRoot: string) =>
        snapshotter.extract({
          repoRoot,
          ref: "fixture",
          sha: "0000000000000000000000000000000000000000",
          modules: ["@fixture/sample/Choice"]
        }).pipe(Effect.map((snapshot) => snapshot.entities[0]?.fingerprint))
      assert.strictEqual(yield* extract(leftRoot), yield* extract(rightRoot))
    }).pipe(Effect.provide(MainLayer)))
})
