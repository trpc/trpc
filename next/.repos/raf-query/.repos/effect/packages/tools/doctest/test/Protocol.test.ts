import * as Protocol from "@effect/doctest/Protocol"
import { assert, describe, it } from "@effect/vitest"

describe("Protocol", () => {
  it("round-trips collector requests", () => {
    const id = Protocol.collectorId("/src/a file.ts", "version-1")

    assert.deepStrictEqual(Protocol.request(Protocol.collectorPrefix, id), {
      file: "/src/a file.ts",
      index: undefined,
      version: "version-1"
    })
  })

  it("round-trips snippet requests", () => {
    const id = Protocol.snippetId("/src/example.ts", 3, "version-1")

    assert.deepStrictEqual(Protocol.request(Protocol.snippetPrefix, id), {
      file: "/src/example.ts",
      index: 3,
      version: "version-1"
    })
  })

  it("rejects malformed virtual requests", () => {
    for (
      const id of [
        "other:file",
        Protocol.snippetPrefix,
        `${Protocol.snippetPrefix}file=example.ts&index=-1`,
        `${Protocol.snippetPrefix}file=example.ts&index=1.5`
      ]
    ) {
      assert.isUndefined(Protocol.request(Protocol.snippetPrefix, id))
    }
  })

  it("round-trips resolved collector identifiers", () => {
    const id = Protocol.resolvedId("collector", {
      file: "/src/example.ts",
      version: "version-1"
    })

    assert.deepStrictEqual(Protocol.resolvedRequest(id), {
      file: "/src/example.ts",
      index: undefined,
      version: "version-1",
      kind: "collector"
    })
  })

  it("round-trips resolved snippet identifiers", () => {
    const id = Protocol.resolvedId("snippet", {
      file: "/src/example.ts",
      index: 2
    })

    assert.deepStrictEqual(Protocol.resolvedRequest(id), {
      file: "/src/example.ts",
      index: 2,
      version: undefined,
      kind: "snippet"
    })
  })

  it("rejects malformed resolved identifiers", () => {
    for (
      const id of [
        "/src/example.ts",
        "/src/example.ts?effect-doctest=unknown",
        "/src/example.ts?effect-doctest=snippet",
        "/src/example.ts?effect-doctest=snippet&index=one"
      ]
    ) {
      assert.isUndefined(Protocol.resolvedRequest(id))
    }
  })
})
