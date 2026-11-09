import { Context, Effect, Schema } from "effect"
import type * as Layer from "effect/Layer"
import * as Rpc from "effect/rpc/Rpc"
import * as RpcGroup from "effect/rpc/RpcGroup"
import { describe, expect, it } from "tstyche"

class Db extends Context.Service<Db, {
  readonly value: string
}>()("Db") {}

class Metrics extends Context.Service<Metrics, {
  readonly value: string
}>()("Metrics") {}

const GetUser = Rpc.make("GetUser", { success: Schema.String })
const UpdateUser = Rpc.make("UpdateUser", { success: Schema.String })
const Group = RpcGroup.make(GetUser, UpdateUser)

describe("RpcGroup", () => {
  it("toLayer includes handler dependencies in layer services", () => {
    const layer = Group.toLayer({
      GetUser: () => Db.use((db) => Effect.succeed(db.value)),
      UpdateUser: () => Db.use((db) => Effect.succeed(db.value))
    })

    type HasExpectedServices = [Layer.Services<typeof layer>] extends [Db] ?
      ([Db] extends [Layer.Services<typeof layer>] ? true : false) :
      false

    expect<HasExpectedServices>().type.toBe<true>()
  })

  it("toLayer includes handler dependencies from effect-built handlers", () => {
    const layer = Group.toLayer(Effect.succeed({
      GetUser: () => Db.use((db) => Effect.succeed(db.value)),
      UpdateUser: () => Db.use((db) => Effect.succeed(db.value))
    }))

    type HasExpectedServices = [Layer.Services<typeof layer>] extends [Db] ?
      ([Db] extends [Layer.Services<typeof layer>] ? true : false) :
      false

    expect<HasExpectedServices>().type.toBe<true>()
  })

  it("toLayerHandler includes handler dependencies in layer services", () => {
    const layer = Group.toLayerHandler("GetUser", () => Metrics.use((metrics) => Effect.succeed(metrics.value)))

    type HasExpectedServices = [Layer.Services<typeof layer>] extends [Metrics] ?
      ([Metrics] extends [Layer.Services<typeof layer>] ? true : false) :
      false

    expect<HasExpectedServices>().type.toBe<true>()
  })

  it("omit removes an rpc", () => {
    const group = Group.omit("GetUser")
    type Tags = RpcGroup.Rpcs<typeof group>["_tag"]
    expect<Tags>().type.toBe<"UpdateUser">()
  })
})
