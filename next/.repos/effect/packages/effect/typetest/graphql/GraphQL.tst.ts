import type { Schema } from "effect"
import { GraphQL } from "effect/graphql"
import { describe, expect, it } from "tstyche"

describe("GraphQL", () => {
  it("otherTypename is a refined String typed as the unselected names", () => {
    expect(GraphQL.otherTypename<"Issue" | "PullRequest" | "Commit">()(["Issue"])).type.toBe<
      Schema.refine<"PullRequest" | "Commit", Schema.String>
    >()
  })

  it("enumLiterals is a refined String typed as the declared literals", () => {
    expect(GraphQL.enumLiterals(["OPEN", "CLOSED"])).type.toBe<Schema.refine<"OPEN" | "CLOSED", Schema.String>>()
  })
})
