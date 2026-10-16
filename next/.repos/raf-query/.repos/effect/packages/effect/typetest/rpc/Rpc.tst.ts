import { Context, Schema } from "effect"
import * as Rpc from "effect/rpc/Rpc"
import * as RpcMiddleware from "effect/rpc/RpcMiddleware"
import { describe, expect, it } from "tstyche"

class CurrentUser extends Context.Service<CurrentUser, { id: string }>()("CurrentUser") {}
class DbConnection extends Context.Service<DbConnection, { url: string }>()("DbConnection") {}

class AuthMiddleware extends RpcMiddleware.Service<AuthMiddleware, {
  provides: CurrentUser
}>()("AuthMiddleware", {
  error: Schema.Never,
  requiredForClient: undefined
}) {}

class DbMiddleware extends RpcMiddleware.Service<DbMiddleware, {
  provides: DbConnection
  requires: CurrentUser
}>()("DbMiddleware", {
  error: Schema.Never,
  requiredForClient: undefined
}) {}

const GetUser = Rpc.make("GetUser", { success: Schema.String })
const StreamEvents = Rpc.make("StreamEvents", { success: Schema.String, stream: true })
const AuthedStream = Rpc.make("AuthedStream", { success: Schema.String, stream: true })
  .middleware(AuthMiddleware)
const AuthedGetUser = Rpc.make("AuthedGetUser", { success: Schema.String })
  .middleware(AuthMiddleware)
const MultiMiddleware = Rpc.make("MultiMiddleware", { success: Schema.String, stream: true })
  .middleware(AuthMiddleware)
  .middleware(DbMiddleware)

type Mixed = typeof GetUser | typeof StreamEvents
type MixedWithMiddleware = typeof GetUser | typeof AuthedStream

describe("Rpc", () => {
  describe("IsStream", () => {
    it("returns true for stream RPCs in a mixed group", () => {
      expect<Rpc.IsStream<Mixed, "StreamEvents">>().type.toBe<true>()
    })

    it("returns never for non-stream RPCs in a mixed group", () => {
      expect<Rpc.IsStream<Mixed, "GetUser">>().type.toBe<never>()
    })
  })

  describe("ExtractProvides", () => {
    it("extracts provided service from stream RPC with middleware", () => {
      expect<Rpc.ExtractProvides<typeof AuthedStream, "AuthedStream">>().type.toBe<CurrentUser>()
    })

    it("extracts provided service from non-stream RPC with middleware", () => {
      expect<Rpc.ExtractProvides<typeof AuthedGetUser, "AuthedGetUser">>().type.toBe<CurrentUser>()
    })

    it("returns never for RPC without middleware", () => {
      expect<Rpc.ExtractProvides<typeof GetUser, "GetUser">>().type.toBe<never>()
    })

    it("extracts union of provides from multiple middlewares", () => {
      expect<Rpc.ExtractProvides<typeof MultiMiddleware, "MultiMiddleware">>()
        .type.toBe<CurrentUser | DbConnection>()
    })

    it("works in a mixed group", () => {
      expect<Rpc.ExtractProvides<MixedWithMiddleware, "AuthedStream">>().type.toBe<CurrentUser>()
    })

    it("returns never for non-middleware RPC in mixed group", () => {
      expect<Rpc.ExtractProvides<MixedWithMiddleware, "GetUser">>().type.toBe<never>()
    })
  })
})
