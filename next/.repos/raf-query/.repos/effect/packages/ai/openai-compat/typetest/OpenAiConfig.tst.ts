import { OpenAiEmbeddingModel, OpenAiLanguageModel } from "@effect/ai-openai-compat"
import { describe, expect, it } from "tstyche"

describe("OpenAI-compatible config", () => {
  it("accepts custom language model properties while preserving known property types", () => {
    expect(OpenAiLanguageModel.model).type.toBeCallableWith("model", {
      temperature: 0.5,
      vendor_setting: true
    })
    expect(OpenAiLanguageModel.model).type.not.toBeCallableWith("model", {
      temperature: "high"
    })
  })

  it("accepts custom embedding properties while preserving known property types", () => {
    expect(OpenAiEmbeddingModel.model).type.toBeCallableWith("model", {
      dimensions: 3,
      user: "test-user",
      vendor_setting: true
    })
    expect(OpenAiEmbeddingModel.model).type.not.toBeCallableWith("model", {
      dimensions: 3,
      user: 1
    })
  })
})
