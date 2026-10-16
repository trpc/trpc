import { Context, Effect, Layer, Schema } from "effect"
import type { FileSystem } from "effect/FileSystem"
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSchema,
  HttpApiSecurity
} from "effect/http-api"
import type { Generator } from "effect/http/Etag"
import type { HttpPlatform } from "effect/http/HttpPlatform"
import * as HttpRouter from "effect/http/HttpRouter"
import type { Request as HttpRouterRequest, RouteContext } from "effect/http/HttpRouter"
import type { HttpServerRequest, ParsedSearchParams } from "effect/http/HttpServerRequest"
import type { HttpServerResponse } from "effect/http/HttpServerResponse"
import type { Path } from "effect/Path"
import { describe, expect, it } from "tstyche"

describe("HttpApiBuilder", () => {
  describe("handler", () => {
    it("infers the selected endpoint's decoded request and preserves service requirements", () => {
      class Repository extends Context.Service<Repository, {}>()("Repository") {}
      class Lookup extends HttpApiEndpoint.post("lookup", "/users/:id", {
        params: { id: Schema.FiniteFromString },
        query: { page: Schema.FiniteFromString },
        payload: Schema.Struct({ name: Schema.String }),
        headers: { "x-token": Schema.String },
        success: Schema.String
      }) {}
      const api = HttpApi.make("api").add(
        HttpApiGroup.make("users").add(Lookup),
        HttpApiGroup.make("admins").add(
          HttpApiEndpoint.get("lookup", "/admins", { success: Schema.Number })
        )
      )
      const handler = HttpApiBuilder.handler(api, "users", "lookup", ({ params, query, payload, headers }) => {
        expect(params).type.toBe<{ readonly id: number }>()
        expect(query).type.toBe<{ readonly page: number }>()
        expect(payload).type.toBe<{ readonly name: string }>()
        expect(headers).type.toBe<{ readonly "x-token": string }>()
        return Effect.as(Repository, payload.name)
      })

      expect(handler).type.toBe<HttpApiEndpoint.Handler<typeof Lookup, never, Repository>>()
      const group = HttpApiBuilder.group(api, "users", (handlers) => handlers.handle("lookup", handler))
      expect(group).type.toBe<
        Layer.Layer<HttpApiGroup.Service<"api", "users">, never, HttpRouterRequest<"Requires", Repository>>
      >()

      const adminHandler = HttpApiBuilder.handler(api, "admins", "lookup", () => Effect.succeed(42))
      expect<Effect.Success<ReturnType<typeof adminHandler>>>().type.toBe<number | HttpServerResponse>()
      expect<Effect.Services<ReturnType<typeof adminHandler>>>().type.toBe<never>()
    })

    it("accepts endpoint and middleware errors while preserving middleware-provided services", () => {
      class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {}) {}
      class Unauthorized extends Schema.TaggedError<Unauthorized>()("Unauthorized", {}) {}
      class Auth extends HttpApiMiddleware.Service<Auth, { provides: CurrentUser }>()("Auth", {
        error: Unauthorized
      }) {}
      const endpoint = HttpApiEndpoint.get("get", "/users", {
        success: Schema.String,
        error: NotFound
      }).middleware(Auth)
      const api = HttpApi.make("api").add(HttpApiGroup.make("users").add(endpoint))
      const handler = HttpApiBuilder.handler(
        api,
        "users",
        "get",
        Effect.fnUntraced(function*() {
          const { userId } = yield* CurrentUser
          if (userId === "missing") return yield* Effect.fail(new NotFound())
          if (userId === "unauthorized") return yield* Effect.fail(new Unauthorized())
          return userId
        })
      )

      expect(handler).type.toBe<HttpApiEndpoint.Handler<typeof endpoint, Unauthorized, CurrentUser>>()
      const group = HttpApiBuilder.group(api, "users", (handlers) => handlers.handle("get", handler))
      expect(group).type.toBe<Layer.Layer<HttpApiGroup.Service<"api", "users">, never, Auth>>()
    })

    it("rejects unknown groups and endpoints outside the selected group", () => {
      const api = HttpApi.make("api").add(
        HttpApiGroup.make("users").add(HttpApiEndpoint.get("getUser", "/users")),
        HttpApiGroup.make("admins").add(HttpApiEndpoint.get("getAdmin", "/admins"))
      )

      expect(HttpApiBuilder.handler).type.not.toBeCallableWith(api, "missing", "getUser", () => Effect.void)
      expect(HttpApiBuilder.handler).type.not.toBeCallableWith(api, "users", "missing", () => Effect.void)
      expect(HttpApiBuilder.handler).type.not.toBeCallableWith(api, "users", "getAdmin", () => Effect.void)
    })

    it("rejects invalid successes and errors from other endpoints", () => {
      class OtherError extends Schema.TaggedError<OtherError>()("OtherError", {}) {}
      class OtherMiddleware extends HttpApiMiddleware.Service<OtherMiddleware>()("OtherMiddleware", {
        error: OtherError
      }) {}
      const api = HttpApi.make("api").add(
        HttpApiGroup.make("users").add(
          HttpApiEndpoint.get("get", "/users", { success: Schema.String }),
          HttpApiEndpoint.get("other", "/other", { success: Schema.Number }).middleware(OtherMiddleware)
        )
      )

      expect(HttpApiBuilder.handler).type.not.toBeCallableWith(api, "users", "get", () => Effect.succeed(42))
      expect(HttpApiBuilder.handler).type.not.toBeCallableWith(api, "users", "get", () => Effect.fail(new OtherError()))
      expect(HttpApiBuilder.handler).type.not.toBeCallableWith(api, "users", "get", () => Effect.fail("undeclared"))
    })
  })

  describe("group", () => {
    it("does not require unknown services for status annotations piped onto errors", () => {
      class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {}) {}
      const Api = HttpApi.make("api").add(
        HttpApiGroup.make("group").add(
          HttpApiEndpoint.get("get", "/", {
            success: Schema.String,
            error: NotFound.pipe(HttpApiSchema.status(404))
          })
        )
      )

      const handlers = HttpApiBuilder.group(
        Api,
        "group",
        Effect.fn(function*(handlers) {
          return handlers.handle("get", () => Effect.succeed("ok"))
        })
      )

      expect(handlers).type.toBe<Layer.Layer<HttpApiGroup.Service<"api", "group">>>()
    })

    describe("handle", () => {
      it("tracks registrations and preserves request inference", () => {
        const User = Schema.Struct({
          id: Schema.String
        })
        const CreateUser = Schema.Struct({
          name: Schema.String
        })
        const Api = HttpApi.make("api").add(
          HttpApiGroup.make("users")
            .add(
              HttpApiEndpoint.get("getUser", "/users/:id", {
                params: {
                  id: Schema.String
                },
                success: User
              })
            )
            .add(
              HttpApiEndpoint.post("createUser", "/users", {
                payload: CreateUser,
                success: User
              })
            )
        )

        const handlers = HttpApiBuilder.group(
          Api,
          "users",
          (handlers) =>
            handlers
              .handle("getUser", ({ params }) => {
                expect(params.id).type.toBe<string>()
                return Effect.succeed({ id: params.id })
              })
              .handle("createUser", ({ payload }) => {
                expect(payload.name).type.toBe<string>()
                return Effect.succeed({ id: payload.name })
              })
        )

        expect(handlers).type.toBe<Layer.Layer<HttpApiGroup.Service<"api", "users">>>()
      })

      it("propagates handler service requirements", () => {
        class UserRepository extends Context.Service<UserRepository, {}>()("UserRepository") {}
        const Api = HttpApi.make("api").add(
          HttpApiGroup.make("users").add(
            HttpApiEndpoint.get("getUser", "/users/:id", {
              success: Schema.String
            })
          )
        )

        const handlers = HttpApiBuilder.group(
          Api,
          "users",
          (handlers) =>
            handlers.handle(
              "getUser",
              Effect.fnUntraced(function*() {
                yield* UserRepository
                return "user"
              })
            )
        )

        expect<Layer.Services<typeof handlers>>().type.toBe<HttpRouterRequest<"Requires", UserRepository>>()
      })

      it("allows middleware to provide multiple handler service requirements", () => {
        class UserRepository extends Context.Service<UserRepository, {}>()("UserRepository") {}
        class UserPreferences extends Context.Service<UserPreferences, {}>()("UserPreferences") {}
        const Api = HttpApi.make("api").add(
          HttpApiGroup.make("users").add(
            HttpApiEndpoint.get("getUser", "/users/:id", {
              success: Schema.String
            })
          )
        )

        const handlers = HttpApiBuilder.group(
          Api,
          "users",
          (handlers) =>
            handlers.handle(
              "getUser",
              Effect.fnUntraced(function*() {
                yield* UserRepository
                yield* UserPreferences
                return "user"
              })
            )
        )

        const middleware = HttpRouter.middleware<{
          provides: UserRepository | UserPreferences
        }>()((effect) =>
          effect.pipe(
            Effect.provideService(UserRepository, {}),
            Effect.provideService(UserPreferences, {})
          )
        ).layer

        const layer = HttpApiBuilder.layer(Api).pipe(
          Layer.provide(handlers),
          Layer.provide(middleware)
        )

        expect<Layer.Services<typeof layer>>().type.toBe<
          Generator | FileSystem | HttpPlatform | HttpRouter.HttpRouter | Path
        >()
      })
    })

    describe("handleAll", () => {
      it("tracks registrations and preserves request inference", () => {
        const User = Schema.Struct({
          id: Schema.String
        })
        const CreateUser = Schema.Struct({
          name: Schema.String
        })
        const Api = HttpApi.make("api").add(
          HttpApiGroup.make("users")
            .add(
              HttpApiEndpoint.get("getUser", "/users/:id", {
                params: {
                  id: Schema.String
                },
                success: User
              })
            )
            .add(
              HttpApiEndpoint.post("createUser", "/users", {
                payload: CreateUser,
                success: User
              })
            )
        )

        const handlers = HttpApiBuilder.group(
          Api,
          "users",
          (handlers) =>
            handlers.handleAll({
              getUser: ({ params }) => {
                expect(params.id).type.toBe<string>()
                return Effect.succeed({ id: params.id })
              },
              createUser: {
                handler: ({ payload }) => {
                  expect(payload.name).type.toBe<string>()
                  return Effect.succeed({ id: payload.name })
                },
                options: { uninterruptible: true }
              }
            })
        )

        expect(handlers).type.toBe<Layer.Layer<HttpApiGroup.Service<"api", "users">>>()
      })

      it("validates partial batches", () => {
        const User = Schema.Struct({
          id: Schema.String
        })
        const Api = HttpApi.make("api").add(
          HttpApiGroup.make("users")
            .add(
              HttpApiEndpoint.get("getUser", "/users/:id", {
                params: {
                  id: Schema.String
                },
                success: User
              })
            )
            .add(
              HttpApiEndpoint.get("listUsers", "/users", {
                success: Schema.Array(User)
              })
            )
        )

        HttpApiBuilder.group(
          Api,
          "users",
          (handlers) => {
            expect(handlers.handleAll).type.not.toBeCallableWith({
              getUser: () => Effect.succeed({ id: "id" }),
              listUsers: () => Effect.succeed([]),
              missing: () => Effect.succeed({ id: "id" })
            })

            return handlers.handleAll({
              getUser: ({ params }) => Effect.succeed({ id: params.id }),
              listUsers: () => Effect.succeed([])
            })
          }
        )

        const incomplete = (handlers: HttpApiBuilder.Handlers.FromGroup<NonNullable<typeof Api.groups.users>>) =>
          handlers.handleAll({
            getUser: ({ params }) => Effect.succeed({ id: params.id })
          })

        expect(HttpApiBuilder.group).type.not.toBeCallableWith(
          Api,
          "users",
          incomplete
        )

        const completeInTwoSteps = (
          handlers: HttpApiBuilder.Handlers.FromGroup<NonNullable<typeof Api.groups.users>>
        ) =>
          handlers
            .handleAll({
              getUser: ({ params }) => Effect.succeed({ id: params.id })
            })
            .handleAll({
              listUsers: () => Effect.succeed([])
            })

        expect(HttpApiBuilder.group).type.toBeCallableWith(
          Api,
          "users",
          completeInTwoSteps
        )

        const rejectsDuplicateAcrossBatches = (
          handlers: HttpApiBuilder.Handlers.FromGroup<NonNullable<typeof Api.groups.users>>
        ) => {
          const afterGetUser = handlers.handleAll({
            getUser: ({ params }) => Effect.succeed({ id: params.id })
          })

          expect(afterGetUser.handleAll).type.not.toBeCallableWith({
            getUser: () => Effect.succeed({ id: "id" }),
            listUsers: () => Effect.succeed([])
          })

          return afterGetUser.handleAll({
            listUsers: () => Effect.succeed([])
          })
        }

        expect(HttpApiBuilder.group).type.toBeCallableWith(
          Api,
          "users",
          rejectsDuplicateAcrossBatches
        )
      })

      it("propagates all handler service requirements", () => {
        class UserRepository extends Context.Service<UserRepository, {}>()("UserRepository") {}
        class UserPreferences extends Context.Service<UserPreferences, {}>()("UserPreferences") {}
        const Api = HttpApi.make("api").add(
          HttpApiGroup.make("users").add(
            HttpApiEndpoint.get("getUser", "/users/:id", {
              success: Schema.String
            }),
            HttpApiEndpoint.get("getPreferences", "/users/:id/preferences", {
              success: Schema.String
            })
          )
        )

        const handlers = HttpApiBuilder.group(
          Api,
          "users",
          (handlers) =>
            handlers.handleAll({
              getUser: Effect.fnUntraced(function*() {
                yield* UserRepository
                return "user"
              }),
              getPreferences: Effect.fnUntraced(function*() {
                yield* UserPreferences
                return "preferences"
              })
            })
        )

        expect<Layer.Services<typeof handlers>>().type.toBe<
          | HttpRouterRequest<"Requires", UserRepository>
          | HttpRouterRequest<"Requires", UserPreferences>
        >()
      })
    })

    describe("handler validation", () => {
      it("rejects incomplete synchronous handler collections", () => {
        const User = Schema.Struct({
          id: Schema.String
        })
        const Api = HttpApi.make("api").add(
          HttpApiGroup.make("users")
            .add(
              HttpApiEndpoint.get("getUser", "/users/:id", {
                params: {
                  id: Schema.String
                },
                success: User
              })
            )
            .add(
              HttpApiEndpoint.get("listUsers", "/users", {
                success: Schema.Array(User)
              })
            )
        )
        const build = (handlers: HttpApiBuilder.Handlers.FromGroup<NonNullable<typeof Api.groups.users>>) =>
          handlers.handle("getUser", ({ params }) => Effect.succeed({ id: params.id }))

        expect(HttpApiBuilder.group).type.not.toBeCallableWith(
          Api,
          "users",
          build
        )
      })

      it("rejects duplicate handlers", () => {
        const User = Schema.Struct({
          id: Schema.String
        })
        const Api = HttpApi.make("api").add(
          HttpApiGroup.make("users")
            .add(
              HttpApiEndpoint.get("getUser", "/users/:id", {
                params: {
                  id: Schema.String
                },
                success: User
              })
            )
            .add(
              HttpApiEndpoint.get("listUsers", "/users", {
                success: Schema.Array(User)
              })
            )
        )
        const build = (handlers: HttpApiBuilder.Handlers.FromGroup<NonNullable<typeof Api.groups.users>>) => {
          const afterGetUser = handlers.handle("getUser", ({ params }) => Effect.succeed({ id: params.id }))

          expect(afterGetUser.handle).type.not.toBeCallableWith(
            "getUser",
            () => Effect.succeed({ id: "id" })
          )
          expect(afterGetUser.handleRaw).type.not.toBeCallableWith(
            "getUser",
            () => Effect.succeed({ id: "id" })
          )

          return afterGetUser.handle("listUsers", () => Effect.succeed([]))
        }

        expect(HttpApiBuilder.group).type.toBeCallableWith(
          Api,
          "users",
          build
        )
      })

      it("rejects incomplete effectful handler collections", () => {
        const User = Schema.Struct({
          id: Schema.String
        })
        const Api = HttpApi.make("api").add(
          HttpApiGroup.make("users")
            .add(
              HttpApiEndpoint.get("getUser", "/users/:id", {
                params: {
                  id: Schema.String
                },
                success: User
              })
            )
            .add(
              HttpApiEndpoint.get("listUsers", "/users", {
                success: Schema.Array(User)
              })
            )
        )
        const build = (handlers: HttpApiBuilder.Handlers.FromGroup<NonNullable<typeof Api.groups.users>>) =>
          Effect.succeed(handlers.handle("getUser", ({ params }) => Effect.succeed({ id: params.id })))

        expect(HttpApiBuilder.group).type.not.toBeCallableWith(
          Api,
          "users",
          build
        )
      })

      it("accepts complete effectful handler collections", () => {
        const User = Schema.Struct({
          id: Schema.String
        })
        const Api = HttpApi.make("api").add(
          HttpApiGroup.make("users")
            .add(
              HttpApiEndpoint.get("getUser", "/users/:id", {
                params: {
                  id: Schema.String
                },
                success: User
              })
            )
            .add(
              HttpApiEndpoint.get("listUsers", "/users", {
                success: Schema.Array(User)
              })
            )
        )
        const build = (handlers: HttpApiBuilder.Handlers.FromGroup<NonNullable<typeof Api.groups.users>>) =>
          Effect.succeed(
            handlers
              .handle("getUser", ({ params }) => Effect.succeed({ id: params.id }))
              .handle("listUsers", () => Effect.succeed([]))
          )

        expect(HttpApiBuilder.group).type.toBeCallableWith(
          Api,
          "users",
          build
        )
      })

      it("limits handle registrations to remaining endpoint identifiers", () => {
        const User = Schema.Struct({
          id: Schema.String
        })
        const Api = HttpApi.make("api").add(
          HttpApiGroup.make("users")
            .add(
              HttpApiEndpoint.get("getUser", "/users/:id", {
                params: {
                  id: Schema.String
                },
                success: User
              })
            )
            .add(
              HttpApiEndpoint.get("listUsers", "/users", {
                success: Schema.Array(User)
              })
            )
        )

        HttpApiBuilder.group(
          Api,
          "users",
          (handlers) => {
            expect(handlers.handle).type.not.toBeCallableWith(
              "missing",
              () => Effect.succeed({ id: "id" })
            )

            const remaining = handlers.handle(
              "getUser",
              ({ params }) => Effect.succeed({ id: params.id })
            )

            expect(remaining.handle).type.not.toBeCallableWith(
              "getUser",
              () => Effect.succeed({ id: "id" })
            )

            return remaining.handle("listUsers", () => Effect.succeed([]))
          }
        )
      })
    })

    describe("handleRaw", () => {
      it("preserves request inference", () => {
        const Api = HttpApi.make("api").add(
          HttpApiGroup.make("files").add(
            HttpApiEndpoint.post("upload", "/files/:id", {
              params: {
                id: Schema.String
              },
              payload: Schema.String,
              success: Schema.String
            })
          )
        )

        const handlers = HttpApiBuilder.group(
          Api,
          "files",
          (handlers) =>
            handlers.handleRaw("upload", (request) => {
              expect(request.params.id).type.toBe<string>()
              expect(request.request).type.toBe<HttpServerRequest>()
              expect(request).type.not.toHaveProperty("payload")
              return Effect.succeed("ok")
            })
        )

        expect(handlers).type.toBe<Layer.Layer<HttpApiGroup.Service<"api", "files">>>()
      })
    })
  })

  describe("endpoint", () => {
    it("preserves selected endpoint middleware and service requirements", () => {
      const api = HttpApi.make("api").add(
        HttpApiGroup.make("group").add(
          HttpApiEndpoint.get("getUser", "/users/:id", {
            params: {
              id: Schema.String
            },
            success: Schema.Struct({
              id: Schema.String
            })
          }).middleware(M)
        )
      )
      const handler = HttpApiBuilder.endpoint(
        api,
        "group",
        "getUser",
        Effect.fnUntraced(function*(ctx) {
          yield* CurrentUser
          return { id: ctx.params.id }
        })
      )
      expect(handler).type.toBe<
        Effect.Effect<
          Effect.Effect<HttpServerResponse, never, HttpServerRequest | ParsedSearchParams | RouteContext>,
          never,
          M | Token | Generator | FileSystem | HttpPlatform | Path
        >
      >()
    })

    it("selects the intended class-like endpoint when identifiers overlap", () => {
      class UsersToken extends Context.Service<UsersToken, {
        readonly token: "users"
      }>()("UsersToken") {}
      class UsersCurrent extends Context.Service<UsersCurrent, {
        readonly userId: string
      }>()("UsersCurrent") {}
      class AdminsToken extends Context.Service<AdminsToken, {
        readonly token: "admins"
      }>()("AdminsToken") {}
      class AdminsCurrent extends Context.Service<AdminsCurrent, {
        readonly adminId: number
      }>()("AdminsCurrent") {}
      class UsersMiddleware extends HttpApiMiddleware.Service<UsersMiddleware, {
        requires: UsersToken
        provides: UsersCurrent
      }>()("UsersMiddleware") {}
      class AdminsMiddleware extends HttpApiMiddleware.Service<AdminsMiddleware, {
        requires: AdminsToken
        provides: AdminsCurrent
      }>()("AdminsMiddleware") {}

      class UsersLookup extends HttpApiEndpoint.post("lookup", "/users/:userId", {
        params: {
          userId: Schema.String
        },
        query: {
          page: Schema.FiniteFromString
        },
        payload: Schema.Struct({ name: Schema.String }),
        headers: {
          "x-user": Schema.String
        },
        success: Schema.Struct({ userId: Schema.String, name: Schema.String })
      }).middleware(UsersMiddleware) {}

      const AdminsLookup = HttpApiEndpoint.post("lookup", "/admins/:adminId", {
        params: {
          adminId: Schema.FiniteFromString
        },
        query: {
          scope: Schema.String
        },
        payload: Schema.Struct({ role: Schema.Literal("admin") }),
        headers: {
          "x-admin": Schema.String
        },
        success: Schema.Struct({ adminId: Schema.Number, role: Schema.String })
      }).middleware(AdminsMiddleware)
      const api = HttpApi.make("api").add(
        HttpApiGroup.make("users").add(UsersLookup),
        HttpApiGroup.make("admins").add(AdminsLookup)
      )

      const usersHandler = HttpApiBuilder.endpoint(
        api,
        "users",
        "lookup",
        Effect.fnUntraced(function*(request) {
          expect(request.params).type.toBe<{ readonly userId: string }>()
          expect(request.query).type.toBe<{ readonly page: number }>()
          expect(request.payload).type.toBe<{ readonly name: string }>()
          expect(request.headers).type.toBe<{ readonly "x-user": string }>()
          expect(request.params).type.not.toHaveProperty("adminId")
          const current = yield* UsersCurrent
          return { userId: current.userId, name: request.payload.name }
        })
      )
      const adminsHandler = HttpApiBuilder.endpoint(
        api,
        "admins",
        "lookup",
        Effect.fnUntraced(function*(request) {
          expect(request.params).type.toBe<{ readonly adminId: number }>()
          expect(request.query).type.toBe<{ readonly scope: string }>()
          expect(request.payload).type.toBe<{ readonly role: "admin" }>()
          expect(request.headers).type.toBe<{ readonly "x-admin": string }>()
          expect(request.params).type.not.toHaveProperty("userId")
          const current = yield* AdminsCurrent
          return { adminId: current.adminId, role: request.payload.role }
        })
      )

      expect<Effect.Services<typeof usersHandler>>().type.toBe<
        UsersMiddleware | UsersToken | Generator | FileSystem | HttpPlatform | Path
      >()
      expect<Effect.Services<typeof adminsHandler>>().type.toBe<
        AdminsMiddleware | AdminsToken | Generator | FileSystem | HttpPlatform | Path
      >()
      expect<Effect.Services<Effect.Success<typeof usersHandler>>>().type.toBe<
        HttpServerRequest | ParsedSearchParams | RouteContext
      >()
      expect<Effect.Services<Effect.Success<typeof adminsHandler>>>().type.toBe<
        HttpServerRequest | ParsedSearchParams | RouteContext
      >()
    })

    it("rejects unknown group identifiers", () => {
      const api = HttpApi.make("api").add(
        HttpApiGroup.make("users").add(HttpApiEndpoint.get("getUser", "/users/:id"))
      )

      expect(HttpApiBuilder.endpoint).type.not.toBeCallableWith(
        api,
        "missing",
        "getUser",
        () => Effect.void
      )
    })

    it("rejects unknown endpoint identifiers", () => {
      const api = HttpApi.make("api").add(
        HttpApiGroup.make("users").add(HttpApiEndpoint.get("getUser", "/users/:id"))
      )

      expect(HttpApiBuilder.endpoint).type.not.toBeCallableWith(
        api,
        "users",
        "missing",
        () => Effect.void
      )
    })
  })
})

class Token extends Context.Service<Token, {
  readonly token: string
}>()("Token") {}

class CurrentUser extends Context.Service<CurrentUser, {
  readonly userId: string
}>()("CurrentUser") {}

class M extends HttpApiMiddleware.Service<M, {
  requires: Token
  provides: CurrentUser
}>()("Http/Logger", {
  error: Schema.String,
  security: {
    cookie: HttpApiSecurity.apiKey({
      in: "cookie",
      key: "token"
    })
  }
}) {}
