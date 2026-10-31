import { HttpMethod } from "effect/http"
import { describe, expect, it } from "tstyche"

declare const knownMethod: HttpMethod.HttpMethod
declare const receivedMethod: string

describe("HttpMethod", () => {
  describe("hasBody", () => {
    it("narrows known methods in both branches", () => {
      if (HttpMethod.hasBody(knownMethod)) {
        expect(knownMethod).type.toBe<HttpMethod.HttpMethod.WithBody>()
      } else {
        expect(knownMethod).type.toBe<HttpMethod.HttpMethod.NoBody>()
      }
    })

    it("accepts received methods without narrowing them to known methods", () => {
      expect(HttpMethod.hasBody(receivedMethod)).type.toBe<boolean>()
      if (HttpMethod.hasBody(receivedMethod)) {
        expect(receivedMethod).type.toBe<string>()
      } else {
        expect(receivedMethod).type.toBe<string>()
      }
    })
  })
})
