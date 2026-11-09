import type { HttpPlatform, HttpServerResponse } from "effect/http"
import { describe, expect, it } from "tstyche"

describe("HttpPlatform", () => {
  it("accepts a synchronous fileResponse implementation", () => {
    expect<ReturnType<Parameters<typeof HttpPlatform.make>[0]["fileResponse"]>>().type.toBe<
      HttpServerResponse.HttpServerResponse
    >()
  })
})
