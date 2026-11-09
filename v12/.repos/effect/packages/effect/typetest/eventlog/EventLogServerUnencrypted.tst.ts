import type * as EventLogServerUnencrypted from "effect/eventlog/EventLogServerUnencrypted"
import { describe, expect, it } from "tstyche"

declare const authorization: EventLogServerUnencrypted.EventLogServerAuthorization["Service"]

describe("EventLogServerUnencrypted", () => {
  it("authorizeIdentity accepts callers that pass only the public key", () => {
    expect(authorization.authorizeIdentity).type.toBeCallableWith({ publicKey: "identity" })
  })
})
