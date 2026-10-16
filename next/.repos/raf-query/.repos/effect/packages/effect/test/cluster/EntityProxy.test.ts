import { assert, describe, it } from "@effect/vitest"
import { PrimaryKey, Schema } from "effect"
import { Entity, EntityProxy } from "effect/cluster"
import { Rpc } from "effect/rpc"

describe("EntityProxy", () => {
  it("constructs the original RPC payload", () => {
    const Request = Rpc.make("Request", {
      payload: { key: Schema.String },
      primaryKey: ({ key }) => key
    })
    const entity = Entity.make("Entity", [Request])
    const group = EntityProxy.toRpcGroup(entity)
    const rpc = group.requests.get("Entity.Request")!

    const payload = rpc.payloadSchema.make({
      entityId: "entity-id",
      payload: { key: "request-id" }
    })

    const originalPayload: unknown = payload.payload
    const primaryKey = PrimaryKey.isPrimaryKey(originalPayload) ? PrimaryKey.value(originalPayload) : undefined
    assert.strictEqual(primaryKey, "request-id")
  })
})
