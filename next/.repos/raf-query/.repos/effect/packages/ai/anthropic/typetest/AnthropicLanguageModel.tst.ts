import { AnthropicLanguageModel } from "@effect/ai-anthropic"
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
})
