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
