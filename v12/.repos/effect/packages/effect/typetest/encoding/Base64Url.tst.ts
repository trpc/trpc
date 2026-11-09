import * as Base64Url from "effect/encoding/Base64Url"
import { describe, expect, it } from "tstyche"

describe("Base64Url", () => {
  it("encode can be passed directly as a callback", () => {
    expect(["a"].map(Base64Url.encode)).type.toBe<Array<string>>()
  })
})
