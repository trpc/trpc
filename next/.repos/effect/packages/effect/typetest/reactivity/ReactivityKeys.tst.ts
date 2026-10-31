// Declaring `Reactivity.Keys` switches every program that sees the declaration
// to strict keys. TSTyche checks each test file in its own program, and this
// file is excluded from `tsconfig.tests.json`, so the declaration stays here.
import { Effect, hole, Layer, Schema } from "effect"
import { EventGroup, EventLog } from "effect/eventlog"
import { HttpClient } from "effect/http"
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { Atom, AtomHttpApi, AtomRegistry, type AtomRpc, Reactivity } from "effect/reactivity"
import { Rpc } from "effect/rpc"
import type { SqlClient } from "effect/sql"
import { describe, expect, it } from "tstyche"

declare module "effect/reactivity/Reactivity" {
  interface Keys {
    users: number
  }
}

const effect = Effect.succeed(1)
const registry = AtomRegistry.make()

describe("Reactivity.Keys", () => {
  it("Reactivity functions accept only declared keys and ID types", () => {
    expect(Reactivity.invalidate).type.toBeCallableWith(["users"])
    expect(Reactivity.invalidate).type.toBeCallableWith({ users: [1] })
    expect(Reactivity.invalidate).type.not.toBeCallableWith(["user"])
    expect(Reactivity.invalidate).type.not.toBeCallableWith({ user: [1] })
    expect(Reactivity.invalidate).type.not.toBeCallableWith({ users: ["1"] })
    expect(Reactivity.invalidate).type.not.toBeCallableWith(hole<ReadonlyArray<string>>())
    expect(Reactivity.mutation).type.not.toBeCallableWith(effect, ["user"])
    expect(Reactivity.query).type.not.toBeCallableWith(effect, ["user"])
    expect(Reactivity.stream).type.not.toBeCallableWith(effect, ["user"])
  })

  it("the Reactivity service accepts undeclared keys", () => {
    const service = hole<Reactivity.Reactivity>()

    expect(service.invalidateUnsafe).type.toBeCallableWith({ anything: ["row"] })
    expect(service.invalidate).type.toBeCallableWith(["anything"])
  })

  it("Atom accepts only declared keys", () => {
    const runtime = Atom.runtime(Layer.empty)

    expect(Atom.withReactivity).type.toBeCallableWith(["users"])
    expect(Atom.withReactivity).type.not.toBeCallableWith(["user"])
    expect(Atom.withReactivity).type.not.toBeCallableWith({ users: ["1"] })
    expect(Atom.runtime.withReactivity).type.not.toBeCallableWith(["user"])
    expect(runtime.fn).type.toBeCallableWith(() => effect, { reactivityKeys: ["users"] })
    expect(runtime.fn).type.not.toBeCallableWith(() => effect, { reactivityKeys: ["user"] })
  })

  it("AtomHttpApi accepts only declared keys", () => {
    const Client = AtomHttpApi.Service()("Client", {
      api: HttpApi.make("Api").add(
        HttpApiGroup.make("users").add(
          HttpApiEndpoint.get("list", "/users", { success: Schema.Array(Schema.String) }),
          HttpApiEndpoint.post("create", "/users")
        )
      ),
      httpClient: Layer.succeed(HttpClient.HttpClient, HttpClient.make(() => Effect.die("not used")))
    })
    const create = Client.mutation("users", "create")

    expect(Client.query).type.toBeCallableWith("users", "list", { reactivityKeys: ["users"] })
    expect(Client.query).type.not.toBeCallableWith("users", "list", { reactivityKeys: ["user"] })
    expect(Client.query).type.not.toBeCallableWith("users", "list", { reactivityKeys: { users: ["1"] } })
    expect(registry.set).type.toBeCallableWith(create, { reactivityKeys: { users: [1] } })
    expect(registry.set).type.not.toBeCallableWith(create, { reactivityKeys: ["user"] })
  })

  it("AtomRpc accepts only declared keys", () => {
    const GetUser = Rpc.make("GetUser", { payload: { id: Schema.Number } })
    const Client = hole<AtomRpc.AtomRpcClient<unknown, "Client", typeof GetUser>>()
    const mutation = Client.mutation("GetUser")

    expect(Client.query).type.toBeCallableWith("GetUser", { id: 1 }, { reactivityKeys: ["users"] })
    expect(Client.query).type.not.toBeCallableWith("GetUser", { id: 1 }, { reactivityKeys: ["user"] })
    expect(registry.set).type.toBeCallableWith(mutation, { payload: { id: 1 }, reactivityKeys: { users: [1] } })
    expect(registry.set).type.not.toBeCallableWith(mutation, { payload: { id: 1 }, reactivityKeys: { users: ["1"] } })
  })

  it("SqlClient accepts only declared keys", () => {
    const sql = hole<SqlClient.SqlClient>()

    expect(sql.reactive).type.toBeCallableWith(["users"], effect)
    expect(sql.reactive).type.not.toBeCallableWith(["user"], effect)
    expect(sql.reactiveMailbox).type.not.toBeCallableWith({ users: ["1"] }, effect)
  })

  it("EventLog.groupReactivity accepts only declared key names", () => {
    const Group = EventGroup.empty.add({
      tag: "UserCreated",
      primaryKey: (payload) => payload.id,
      payload: Schema.Struct({ id: Schema.String })
    })

    expect(EventLog.groupReactivity).type.toBeCallableWith(Group, ["users"])
    expect(EventLog.groupReactivity).type.toBeCallableWith(Group, { UserCreated: ["users"] })
    expect(EventLog.groupReactivity).type.not.toBeCallableWith(Group, ["user"])
    expect(EventLog.groupReactivity).type.not.toBeCallableWith(Group, { UserCreated: ["user"] })
  })
})
