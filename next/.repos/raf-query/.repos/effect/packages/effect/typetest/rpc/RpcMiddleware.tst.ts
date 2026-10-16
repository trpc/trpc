import { Context, Schema } from "effect"
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

class TimingMiddleware extends RpcMiddleware.Service<TimingMiddleware>()("TimingMiddleware") {}

describe("RpcMiddleware", () => {
  it("Provides extracts the provided service", () => {
    expect<RpcMiddleware.Provides<AuthMiddleware>>().type.toBe<CurrentUser>()
  })

  it("Provides returns never for middleware that provides nothing", () => {
    expect<RpcMiddleware.Provides<TimingMiddleware>>().type.toBe<never>()
  })

  it("Requires extracts the required service", () => {
    expect<RpcMiddleware.Requires<DbMiddleware>>().type.toBe<CurrentUser>()
  })

  it("Requires returns never when no requirements", () => {
    expect<RpcMiddleware.Requires<AuthMiddleware>>().type.toBe<never>()
  })
})
