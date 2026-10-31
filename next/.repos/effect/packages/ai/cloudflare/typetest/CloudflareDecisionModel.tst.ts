import type * as CloudflareClient from "@effect/ai-cloudflare/CloudflareClient"
import * as CloudflareDecisionModel from "@effect/ai-cloudflare/CloudflareDecisionModel"
import { describe, expect, it } from "tstyche"

declare const client: CloudflareClient.Service
declare const model: string

describe("Cloudflare model identifiers", () => {
  it("accepts arbitrary strings through the public constructors and client", () => {
    expect(CloudflareDecisionModel.model).type.toBeCallableWith(model)
    expect(CloudflareDecisionModel.make).type.toBeCallableWith({ model })
    expect(CloudflareDecisionModel.layer).type.toBeCallableWith({ model })
    expect(client.createDecisions).type.toBeCallableWith({ model, state: "Checkout is down", questions: {} })
  })

  it("still accepts the built-in model identifiers", () => {
    expect(CloudflareDecisionModel.model).type.toBeCallableWith("clef")
    expect(CloudflareDecisionModel.model).type.toBeCallableWith("clef-flash")
  })
})

describe("Cloudflare images", () => {
  it("accepts data URLs and base64 images with any media type", () => {
    expect(client.createDecisions).type.toBeCallableWith({
      model,
      state: "Checkout is down",
      questions: {},
      images: [
        "data:image/png;base64,iVBORw==",
        { content_type: "image/png", base64: "iVBORw==" },
        { content_type: model, base64: "iVBORw==" }
      ]
    })
  })

  it("rejects images without base64 data", () => {
    expect(client.createDecisions).type.not.toBeCallableWith({
      model,
      state: "Checkout is down",
      questions: {},
      images: [{ content_type: "image/png" }]
    })
  })
})
