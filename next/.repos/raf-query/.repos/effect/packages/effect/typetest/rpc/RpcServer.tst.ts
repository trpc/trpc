import { Schema } from "effect"
import * as Rpc from "effect/rpc/Rpc"
import * as RpcGroup from "effect/rpc/RpcGroup"
import * as RpcServer from "effect/rpc/RpcServer"
import { describe, it } from "tstyche"

const Ping = Rpc.make("Ping", { success: Schema.String })
const Group = RpcGroup.make(Ping)

describe("RpcServer", () => {
  it("layerHttp accepts disableFatalDefects", () => {
    RpcServer.layerHttp({
      group: Group,
      path: "/rpc",
      disableFatalDefects: true
    })
  })

  it("toHttpEffect accepts disableFatalDefects", () => {
    void RpcServer.toHttpEffect(Group, { disableFatalDefects: true })
  })

  it("toHttpEffectWebsocket accepts disableFatalDefects", () => {
    void RpcServer.toHttpEffectWebsocket(Group, { disableFatalDefects: true })
  })
})
