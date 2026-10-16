import { type Effect, hole, Schema } from "effect"
import { Rpc, type RpcClient } from "effect/rpc"
import { describe, expect, it } from "tstyche"

const A = Rpc.make("A", { payload: { id: Schema.String }, success: Schema.Number })
const B = Rpc.make("B", { success: Schema.String })

describe("RpcClient.Flat", () => {
  it("infers a result per RPC for a union of tags", () => {
    const client = hole<RpcClient.RpcClient.Flat<typeof A | typeof B>>()

    expect(client(hole<"A" | "B">(), hole<{ readonly id: string } | void>())).type.toBe<
      Effect.Effect<number> | Effect.Effect<string>
    >()
  })
})
