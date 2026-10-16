import { Context, Effect, hole, Layer, Schema } from "effect"
import { type Atom, AtomRpc } from "effect/reactivity"
import { Rpc, RpcGroup, RpcMiddleware } from "effect/rpc"
import { describe, expect, it } from "tstyche"

describe("AtomRpc", () => {
  class ServerDependency extends Context.Service<
    ServerDependency,
    {}
  >()("ServerDependency") {}

  class RequiringMiddleware extends RpcMiddleware.Service<RequiringMiddleware, {
    requires: ServerDependency
  }>()("RequiringMiddleware", {}) {}

  const RequiringGroup = RpcGroup.make(
    Rpc.make("getUser", {
      success: Schema.Struct({
        id: Schema.Number,
        name: Schema.String
      })
    }).middleware(RequiringMiddleware)
  )

  it("query supports RPCs whose middleware declares service requirements", () => {
    const Client = AtomRpc.Service()("RequiringClient", {
      group: RequiringGroup,
      protocol: Layer.empty,
      makeEffect: Effect.die("unused")
    })

    const query = Client.query("getUser", undefined)

    expect<Atom.Success<typeof query>>().type.toBe<{
      readonly id: number
      readonly name: string
    }>()
  })

  it("query and mutation infer a union of tags", () => {
    const A = Rpc.make("A", { payload: { id: Schema.String }, success: Schema.Number })
    const B = Rpc.make("B", { success: Schema.String })
    const client = hole<AtomRpc.AtomRpcClient<unknown, "Client", typeof A | typeof B>>()
    const tag = hole<"A" | "B">()
    const query = client.query(tag, hole<{ readonly id: string } | void>())
    const mutation = client.mutation(tag)

    expect<Atom.Success<typeof query>>().type.toBe<number | string>()
    expect<Atom.Success<typeof mutation>>().type.toBe<number | string>()
  })
})
