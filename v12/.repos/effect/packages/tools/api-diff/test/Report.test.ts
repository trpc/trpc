import type { ApiDiff } from "@effect/api-diff/Model"
import { renderMarkdownReport } from "@effect/api-diff/Report"
import { assert, describe, it } from "@effect/vitest"

describe("API diff report", () => {
  it("classifies effect/http-api as unstable", () => {
    const diff: ApiDiff = {
      version: 1,
      base: { ref: "base", sha: "a".repeat(40) },
      head: { ref: "head", sha: "b".repeat(40) },
      changes: [{
        id: "http-api-change",
        classification: "api-added",
        confidence: 1,
        headApiId: "effect/http-api#endpoint#value",
        authoritative: true
      }]
    }

    const report = renderMarkdownReport(diff)

    assert(report.includes("| unstable/http-api | effect/http-api | 1 |"))
    assert(report.includes("\n## Unstable API changes\n"))
    assert(!report.includes("\n## Stable API changes\n"))
  })
})
