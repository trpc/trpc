import { NpmCli, promote, type ReleasePackage } from "@effect/npm-promote"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as HttpClient from "effect/http/HttpClient"
import { type Published, registryClient } from "./utils.ts"

const run = (packages: ReadonlyArray<ReleasePackage>, registry: Record<string, Published>) => {
  const distTagCalls: Array<string> = []
  return promote(packages).pipe(
    Effect.map((result) => ({ result, distTagCalls })),
    Effect.provideService(HttpClient.HttpClient, registryClient(registry)),
    Effect.provideService(
      NpmCli,
      NpmCli.of({
        addDistTag: ({ name, tag, version }) => Effect.sync(() => distTagCalls.push(`${name}@${version} ${tag}`))
      })
    )
  )
}

const release: ReadonlyArray<ReleasePackage> = [
  { name: "@effect/platform-node", version: "4.0.4" },
  { name: "effect", version: "4.0.4" },
  { name: "@effect/sql-pg", version: "4.0.4" }
]

describe("NpmPromote", () => {
  it.effect("promotes every package, effect first, once all versions are visible", () =>
    Effect.gen(function*() {
      const { distTagCalls, result } = yield* run(release, {
        "effect": { latest: "4.0.3", versions: ["4.0.3", "4.0.4"] },
        "@effect/platform-node": { latest: "4.0.3", versions: ["4.0.3", "4.0.4"] },
        "@effect/sql-pg": { latest: "4.0.3", versions: ["4.0.3", "4.0.4"] }
      })
      assert.deepStrictEqual(distTagCalls, [
        "effect@4.0.4 latest",
        "@effect/platform-node@4.0.4 latest",
        "@effect/sql-pg@4.0.4 latest"
      ])
      assert.deepStrictEqual(result, {
        _tag: "Promoted",
        promoted: [
          { name: "effect", version: "4.0.4" },
          { name: "@effect/platform-node", version: "4.0.4" },
          { name: "@effect/sql-pg", version: "4.0.4" }
        ]
      })
    }))

  it.effect("promotes nothing while any version is not visible", () =>
    Effect.gen(function*() {
      const { distTagCalls, result } = yield* run(release, {
        "effect": { latest: "4.0.3", versions: ["4.0.3"] },
        "@effect/platform-node": { latest: "4.0.3", versions: ["4.0.3", "4.0.4"] }
      })
      assert.deepStrictEqual(distTagCalls, [])
      assert.deepStrictEqual(result, {
        _tag: "NotVisible",
        pending: [
          { name: "effect", version: "4.0.4" },
          { name: "@effect/sql-pg", version: "4.0.4" }
        ]
      })
    }))

  it.effect("finishes a partly promoted release", () =>
    Effect.gen(function*() {
      const { distTagCalls, result } = yield* run(release, {
        "effect": { latest: "4.0.4", versions: ["4.0.3", "4.0.4"] },
        "@effect/platform-node": { latest: "4.0.4", versions: ["4.0.3", "4.0.4"] },
        "@effect/sql-pg": { latest: "4.0.3", versions: ["4.0.3", "4.0.4"] }
      })
      assert.deepStrictEqual(distTagCalls, ["@effect/sql-pg@4.0.4 latest"])
      assert.deepStrictEqual(result, {
        _tag: "Promoted",
        promoted: [{ name: "@effect/sql-pg", version: "4.0.4" }]
      })
    }))

  it.effect("never moves latest backwards", () =>
    Effect.gen(function*() {
      const { distTagCalls, result } = yield* run([
        { name: "effect", version: "4.0.9" },
        { name: "@effect/sql-pg", version: "4.0.9" }
      ], {
        "effect": { latest: "4.0.10", versions: ["4.0.9", "4.0.10"] },
        "@effect/sql-pg": { latest: "4.0.8", versions: ["4.0.8", "4.0.9"] }
      })
      assert.deepStrictEqual(distTagCalls, ["@effect/sql-pg@4.0.9 latest"])
      assert.deepStrictEqual(result, {
        _tag: "Promoted",
        promoted: [{ name: "@effect/sql-pg", version: "4.0.9" }]
      })
    }))

  it.effect("reads the live latest tag before writing", () =>
    Effect.gen(function*() {
      const { distTagCalls, result } = yield* run([{ name: "effect", version: "4.0.4" }], {
        "effect": { latest: "4.0.5", cachedLatest: "4.0.3", versions: ["4.0.3", "4.0.4", "4.0.5"] }
      })
      assert.deepStrictEqual(distTagCalls, [])
      assert.deepStrictEqual(result, { _tag: "Promoted", promoted: [] })
    }))

  it.effect("decides from the live latest tag when the cached one is already at the target", () =>
    Effect.gen(function*() {
      // effect was rolled back by hand, but the cached metadata still shows the target.
      const { distTagCalls, result } = yield* run([
        { name: "effect", version: "4.0.4" },
        { name: "@effect/sql-pg", version: "4.0.4" }
      ], {
        "effect": { latest: "4.0.3", cachedLatest: "4.0.4", versions: ["4.0.3", "4.0.4"] },
        "@effect/sql-pg": { latest: "4.0.3", versions: ["4.0.3", "4.0.4"] }
      })
      assert.deepStrictEqual(distTagCalls, ["effect@4.0.4 latest", "@effect/sql-pg@4.0.4 latest"])
      assert.deepStrictEqual(result, {
        _tag: "Promoted",
        promoted: [{ name: "effect", version: "4.0.4" }, { name: "@effect/sql-pg", version: "4.0.4" }]
      })
    }))
})
