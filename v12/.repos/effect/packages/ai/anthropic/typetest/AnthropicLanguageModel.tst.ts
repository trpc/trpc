import { AnthropicLanguageModel, type Generated } from "@effect/ai-anthropic"
import { describe, expect, it } from "tstyche"

declare const acceptsKnownModel: (model: AnthropicLanguageModel.Model) => void

describe("AnthropicLanguageModel", () => {
  describe("Model", () => {
    it("keeps the known model ids as literals, while the constructors still accept custom ids", () => {
      expect(acceptsKnownModel).type.toBeCallableWith("claude-opus-4-8")
      expect(acceptsKnownModel).type.not.toBeCallableWith("not-a-real-model")
      expect(AnthropicLanguageModel.model).type.toBeCallableWith("not-a-real-model")
    })
  })

  describe("Config", () => {
    it("accepts the adaptive thinking display setting", () => {
      expect(AnthropicLanguageModel.model).type.toBeCallableWith("claude-opus-4-6", {
        thinking: { type: "adaptive", display: "omitted" }
      })
    })
  })
})

// Released `Generated` contracts that must survive spec updates
describe("Generated", () => {
  it("keeps the 4XX error aliases", () => {
    expect<Generated.BetaMessagesPost4XX>().type.toBe<Generated.BetaErrorResponse>()
  })

  it("keeps stream event schemas that no operation references", () => {
    expect<Generated.MessageStartEvent["type"]>().type.toBe<"message_start">()
  })

  it("keeps the legacy skill response shape", () => {
    expect<Generated.CreateSkillResponse>().type.toBe<{
      readonly created_at: string
      readonly display_title: string | null
      readonly id: string
      readonly latest_version: string | null
      readonly source: string
      readonly type: string
      readonly updated_at: string
    }>()
  })

  it("keeps the released standalone Skill contract", () => {
    expect<Generated.Skill>().type.toBe<{
      readonly created_at: string
      readonly display_title: string | null
      readonly id: string
      readonly latest_version: string | null
      readonly source: string
      readonly type: string
      readonly updated_at: string
    }>()
  })
})
