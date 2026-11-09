import { assert, describe, it } from "@effect/vitest"
import { Context, DateTime, Effect, Layer, Ref, Schema } from "effect"
import { GraphQL, GraphQLClient, GraphQLGroup, GraphQLMiddleware } from "effect/graphql"
import * as Headers from "effect/http/Headers"
import { executeLayer, expectReason, IssuesGroup, RepoIssues, Viewer, ViewerGroup } from "./fixtures.ts"

class CurrentUser extends Context.Service<CurrentUser, { readonly id: string }>()("test/CurrentUser") {}
class TokenExpired extends Schema.TaggedError<TokenExpired>()("TokenExpired", { user: Schema.String }) {}

class Auth extends GraphQLMiddleware.Service<Auth, { requires: CurrentUser; error: TokenExpired }>()("test/Auth") {}
class OpA extends GraphQLMiddleware.Service<OpA>()("test/OpA") {}
class OpB extends GraphQLMiddleware.Service<OpB>()("test/OpB") {}
class GroupA extends GraphQLMiddleware.Service<GroupA>()("test/GroupA") {}
class GroupB extends GraphQLMiddleware.Service<GroupB>()("test/GroupB") {}

const AuthLive = Layer.succeed(
  Auth,
  GraphQLMiddleware.mapRequest(Effect.fnUntraced(function*(request) {
    assert.isTrue(Headers.isHeaders(request.headers))
    assert.notProperty(request.headers, "X-Request-Id")
    const user = yield* CurrentUser
    if (user.id === "expired") return yield* new TokenExpired({ user: user.id })
    return { ...request, headers: Headers.set(request.headers, "authorization", `Bearer ${user.id}`) }
  }))
)

const viewerData = { data: { viewer: { login: "tim" } } }

const variables = { owner: "Effect-TS", name: "effect" }

const partialIssues = {
  data: {
    repository: {
      issues: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [{ number: 1, title: "Hi", createdAt: "2026-01-01T00:00:00Z" }, null]
      }
    }
  },
  errors: [{ type: "NOT_FOUND", message: "Not found", path: ["repository", "issues", "nodes", 1] }]
}

const repoIssuesClient = (result: unknown) =>
  executeLayer(result).pipe(
    Effect.flatMap(({ layer }) => GraphQLClient.make(IssuesGroup).pipe(Effect.provide(layer)))
  )

describe("GraphQLClient", () => {
  describe("middleware", () => {
    it.effect("group middleware runs outside operation middleware, attach order within a level", () =>
      Effect.gen(function*() {
        const log = yield* Ref.make<Array<string>>([])
        const record = (name: string) =>
          GraphQLMiddleware.mapRequest((request) => Effect.as(Ref.update(log, (all) => [...all, name]), request))

        const group = GraphQLGroup.make(Viewer.middleware(OpA).middleware(OpB))
          .middleware(GroupA)
          .middleware(GroupB)
        const { layer } = yield* executeLayer(viewerData)

        yield* GraphQLClient.make(group).pipe(
          Effect.flatMap((client) => client.Viewer()),
          Effect.provide([
            layer,
            Layer.succeed(OpA, record("OpA")),
            Layer.succeed(OpB, record("OpB")),
            Layer.succeed(GroupA, record("GroupA")),
            Layer.succeed(GroupB, record("GroupB"))
          ])
        )
        assert.deepStrictEqual(yield* Ref.get(log), ["GroupA", "GroupB", "OpA", "OpB"])
      }))

    it.effect("mapRequest transforms the request and its errors reach the caller", () =>
      Effect.gen(function*() {
        const { layer, requests } = yield* executeLayer(viewerData)
        const client = yield* GraphQLClient.make(ViewerGroup.middleware(Auth)).pipe(Effect.provide([layer, AuthLive]))

        yield* client.Viewer().pipe(Effect.provideService(CurrentUser, { id: "tim" }))
        assert.strictEqual((yield* Ref.get(requests))[0].headers["authorization"], "Bearer tim")

        const error = yield* client.Viewer().pipe(Effect.provideService(CurrentUser, { id: "expired" }), Effect.flip)
        assert.instanceOf(error, TokenExpired)
        assert.strictEqual((yield* Ref.get(requests)).length, 1)
      }))

    it.effect("per-call context provides services and headers are normalized before middleware", () =>
      Effect.gen(function*() {
        const { layer, requests } = yield* executeLayer(viewerData)
        const client = yield* GraphQLClient.make(ViewerGroup.middleware(Auth)).pipe(Effect.provide([layer, AuthLive]))
        yield* client.Viewer(undefined, {
          context: Context.make(CurrentUser, { id: "ctx" }),
          headers: [["X-Request-Id", "abc"]]
        })
        assert.deepStrictEqual(
          (yield* Ref.get(requests))[0].headers,
          Headers.fromInput({
            authorization: "Bearer ctx",
            "x-request-id": "abc"
          })
        )
      }))

    it.effect("middleware see the transport status from next and may rewrite it; ResponseError carries it", () =>
      Effect.gen(function*() {
        class Status extends GraphQLMiddleware.Service<Status>()("test/Status") {}
        const StatusLive = Layer.succeed(Status, {
          execute: ({ next, request }) =>
            Effect.map(next(request), (result) => ({ ...result, status: result.status === 401 ? 403 : 500 })),
          subscribe: ({ next, request }) => next(request)
        })
        const { layer } = yield* executeLayer({ errors: [{ message: "denied" }] }, 401)
        const reason = yield* GraphQLClient.make(ViewerGroup.middleware(Status)).pipe(
          Effect.flatMap((client) => client.Viewer()),
          Effect.provide([layer, StatusLive]),
          expectReason("ResponseError")
        )
        assert.strictEqual(reason.status, 403)
      }))
  })

  it.effect("encodes variables through the custom scalar codec", () =>
    Effect.gen(function*() {
      const { layer, requests } = yield* executeLayer({ data: { repository: null } })
      yield* GraphQLClient.make(IssuesGroup).pipe(
        Effect.flatMap((client) =>
          client.RepoIssues({ ...variables, since: DateTime.makeUnsafe("2026-01-01T00:00:00Z") })
        ),
        Effect.provide(layer)
      )
      const [request] = yield* Ref.get(requests)
      assert.strictEqual(request.operationName, "RepoIssues")
      assert.strictEqual(request.query, RepoIssues.document)
      assert.deepStrictEqual(request.variables, { ...variables, since: "2026-01-01T00:00:00.000Z" })
    }))

  it.effect("a rejected input is an EncodeError and nothing is sent", () =>
    Effect.gen(function*() {
      const First = GraphQL.query("First", {
        document: "query First($first:Int!){viewer{login}}",
        variables: { first: Schema.Int.check(Schema.isGreaterThan(0)) },
        result: Schema.Struct({ viewer: Schema.Struct({ login: Schema.String }) })
      })
      const { layer, requests } = yield* executeLayer(viewerData)
      yield* GraphQLClient.make(GraphQLGroup.make(First)).pipe(
        Effect.flatMap((client) => client.First({ first: 0 })),
        Effect.provide(layer),
        expectReason("EncodeError")
      )
      assert.deepStrictEqual(yield* Ref.get(requests), [])
    }))

  it.effect("a response with errors fails with ResponseError carrying the raw data and errors", () =>
    Effect.gen(function*() {
      const client = yield* repoIssuesClient(partialIssues)
      const reason = yield* expectReason("ResponseError")(client.RepoIssues(variables))
      assert.deepStrictEqual(reason.data, partialIssues.data)
      assert.deepStrictEqual<unknown>(reason.errors, partialIssues.errors)
    }))

  it.effect("data that does not match the result schema is a DecodeError", () =>
    Effect.gen(function*() {
      const { layer } = yield* executeLayer({ data: { viewer: { login: 42 } } })
      yield* GraphQLClient.make(ViewerGroup).pipe(
        Effect.flatMap((client) => client.Viewer()),
        Effect.provide(layer),
        expectReason("DecodeError")
      )
    }))

  describe("partial: true", () => {
    it.effect("returns decoded data alongside the errors", () =>
      Effect.gen(function*() {
        const client = yield* repoIssuesClient(partialIssues)
        const { data, errors } = yield* client.RepoIssues(variables, { partial: true })
        assert.strictEqual(data.repository!.issues!.nodes![0]!.title, "Hi")
        assert.deepStrictEqual(errors, partialIssues.errors)
      }))

    it.effect("data: null plus errors is a ResponseError", () =>
      Effect.gen(function*() {
        const client = yield* repoIssuesClient({ data: null, errors: [{ message: "boom" }] })
        yield* expectReason("ResponseError")(client.RepoIssues(variables, { partial: true }))
      }))
  })

  it.effect("data: null with no errors is a DecodeError even when the result codec accepts null", () =>
    Effect.gen(function*() {
      const Raw = GraphQL.query("Raw", { document: "query Raw{__typename}", result: Schema.Json })
      const { layer } = yield* executeLayer({ data: null })
      const client = yield* GraphQLClient.make(GraphQLGroup.make(Raw)).pipe(Effect.provide(layer))
      yield* expectReason("DecodeError")(client.Raw())
      yield* expectReason("DecodeError")(client.Raw(undefined, { partial: true }))
    }))
})
