import { type Generated, OpenAiTool } from "@effect/ai-openai"
import type { Tool } from "effect/ai"
import { describe, expect, it } from "tstyche"

describe("OpenAiTool", () => {
  it("distinguishes completed file searches from failed and unfinished searches", () => {
    const fileSearch = OpenAiTool.FileSearch({ vector_store_ids: ["vs_123"] })

    type Failure = {
      readonly status: "in_progress" | "searching" | "incomplete" | "failed"
      readonly queries: Generated.FileSearchToolCall["queries"]
      readonly results: Exclude<Generated.FileSearchToolCall["results"], undefined>
    }

    expect<Tool.Failure<typeof fileSearch>>().type.toBe<Failure>()
    expect<Tool.Success<typeof fileSearch>>().type.toBe<Omit<Failure, "status"> & { readonly status: "completed" }>()
  })

  it("distinguishes completed web searches from failed and unfinished searches", () => {
    const webSearch = OpenAiTool.WebSearch({})

    type Failure = {
      readonly action?: Exclude<Generated.WebSearchToolCall["action"], undefined>
      readonly status: "in_progress" | "searching" | "failed" | "incomplete"
    }

    expect<Tool.Failure<typeof webSearch>>().type.toBe<Failure>()
    expect<Tool.Parameters<typeof webSearch>>().type.toBe<Pick<Failure, "action">>()
    expect<Tool.Success<typeof webSearch>>().type.toBe<Pick<Failure, "action"> & { readonly status: "completed" }>()
  })

  it("keeps search sources optional and distinguishes URL sources from named API sources", () => {
    const webSearch = OpenAiTool.WebSearch({})
    const preview = OpenAiTool.WebSearchPreview({})
    type Sources<Action extends Generated.WebSearchToolCall["action"]> = Pick<
      Extract<Action, { type: "search" }>,
      "sources"
    >
    type Expected = {
      readonly sources?: ReadonlyArray<
        | { readonly type: "url"; readonly url: string }
        | { readonly type: "api"; readonly name: string }
      >
    }

    expect<Sources<Tool.Parameters<typeof webSearch>["action"]>>().type.toBe<Expected>()
    expect<Sources<Tool.Success<typeof webSearch>["action"]>>().type.toBe<Expected>()
    expect<Sources<Tool.Failure<typeof webSearch>["action"]>>().type.toBe<Expected>()
    expect<Sources<Tool.Success<typeof preview>["action"]>>().type.toBe<Expected>()
  })
})
