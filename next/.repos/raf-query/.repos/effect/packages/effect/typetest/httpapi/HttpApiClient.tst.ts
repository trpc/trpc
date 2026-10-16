/** @effect-diagnostics missingEffectContext:skip-file */
import { Effect, hole, Schema, type Stream } from "effect"
import type * as Sse from "effect/encoding/Sse"
import { FetchHttpClient, HttpClient, type HttpClientError, type HttpClientResponse } from "effect/http"
import {
  HttpApi,
  HttpApiClient,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSchema
} from "effect/http-api"
import { describe, expect, it } from "tstyche"

type ResponseMode = HttpApiEndpoint.ClientResponseMode

describe("HttpApiClient", () => {
  describe("params", () => {
    it("derives request params from a field record", () => {
      const Api = HttpApi.make("Api")
        .add(
          HttpApiGroup.make("group")
            .add(
              HttpApiEndpoint.get("a", "/a", {
                params: {
                  id: Schema.Finite
                }
              })
            )
        )
      const client = Effect.runSync(
        HttpApiClient.make(Api).pipe(Effect.provide(FetchHttpClient.layer))
      )
      const f = client.group.a
      expect<Parameters<typeof f>[0]>().type.toBe<
        {
          readonly params: { readonly id: number }
          readonly sseOptions?: Sse.DecodeOptions | undefined
          readonly responseMode?: ResponseMode
        }
      >()
    })
  })

  describe("query", () => {
    it("derives request query from a field record", () => {
      const Api = HttpApi.make("Api")
        .add(
          HttpApiGroup.make("group")
            .add(
              HttpApiEndpoint.get("a", "/a", {
                query: {
                  id: Schema.Finite
                }
              })
            )
        )
      const client = Effect.runSync(
        HttpApiClient.make(Api).pipe(Effect.provide(FetchHttpClient.layer))
      )
      const f = client.group.a
      expect<Parameters<typeof f>[0]>().type.toBe<
        {
          readonly query: { readonly id: number }
          readonly sseOptions?: Sse.DecodeOptions | undefined
          readonly responseMode?: ResponseMode
        }
      >()
    })
  })

  describe("urlBuilder", () => {
    it("mirrors the client shape and uses schema input types", () => {
      const Api = HttpApi.make("Api")
        .add(
          HttpApiGroup.make("users")
            .add(
              HttpApiEndpoint.get("getUser", "/users/:id", {
                disableCodecs: true,
                params: {
                  id: Schema.FiniteFromString
                },
                query: {
                  page: Schema.FiniteFromString
                }
              }),
              HttpApiEndpoint.get("searchUsers", "/users", {
                disableCodecs: true,
                query: {
                  q: Schema.String
                }
              }),
              HttpApiEndpoint.get("health", "/health", {
                disableCodecs: true
              })
            )
        )

      const builder = HttpApiClient.urlBuilder(Api, {
        baseUrl: "https://api.example.com"
      })

      expect(builder.users.getUser({ params: { id: 123 }, query: { page: 1 } })).type.toBe<string>()
      expect<Parameters<typeof builder.users.getUser>[0]>().type.toBe<
        { readonly params: { readonly id: number }; readonly query: { readonly page: number } }
      >()
      expect(builder.users.searchUsers({ query: { q: "Ada" } })).type.toBe<string>()
      expect<Parameters<typeof builder.users.searchUsers>[0]>().type.toBe<
        { readonly query: { readonly q: string } }
      >()
      expect(builder.users.health()).type.toBe<string>()
      expect<Parameters<typeof builder.users.health>[0]>().type.toBe<void | undefined>()
      expect(builder.users.getUser).type.not.toBeCallableWith({ params: { id: "123" }, query: { page: 1 } })
      expect(builder.users.getUser).type.not.toBeCallableWith({ params: { id: 123 }, query: { page: "1" } })
      expect(builder.users.searchUsers).type.not.toBeCallableWith({ params: { id: 123 } })
      expect(builder.users.health).type.not.toBeCallableWith({ params: { id: 123 } })
      expect(builder.users.health).type.not.toBeCallableWith({ query: { q: "Ada" } })
      expect(builder.users).type.not.toHaveProperty("missing")
    })

    it("preserves prefixes and exposes top-level endpoints", () => {
      const Api = HttpApi.make("Api")
        .add(
          HttpApiGroup.make("users")
            .add(
              HttpApiEndpoint.get("getUser", "/users/:id", {
                disableCodecs: true,
                params: {
                  id: Schema.FiniteFromString
                }
              }),
              HttpApiEndpoint.get("health", "/health")
            )
        )
        .add(
          HttpApiGroup.make("top", { topLevel: true })
            .add(
              HttpApiEndpoint.get("topHealth", "/top-health")
            )
        )
        .prefix("/v1")

      const builder = HttpApiClient.urlBuilder(Api)

      expect(builder.users.getUser({ params: { id: 123 } })).type.toBe<string>()
      expect(builder.topHealth()).type.toBe<string>()
      expect(builder.users.getUser).type.not.toBeCallableWith({ params: { id: "123" } })
      expect(builder).type.not.toHaveProperty("top")
    })
  })

  describe("top-level groups", () => {
    it("exposes top-level endpoints directly on the generated client", () => {
      const Api = HttpApi.make("Api")
        .add(
          HttpApiGroup.make("users")
            .add(
              HttpApiEndpoint.get("getUser", "/users/:id", {
                params: {
                  id: Schema.FiniteFromString
                },
                success: Schema.Struct({ id: Schema.String })
              })
            )
        )
        .add(
          HttpApiGroup.make("top", { topLevel: true })
            .add(
              HttpApiEndpoint.get("topHealth", "/top-health", {
                success: Schema.Struct({ ok: Schema.Boolean })
              })
            )
        )
      const client = Effect.runSync(
        HttpApiClient.make(Api).pipe(Effect.provide(FetchHttpClient.layer))
      )

      expect(client.users.getUser({ params: { id: 1 } })).type.toBe<
        Effect.Effect<{ readonly id: string }, HttpClientError.HttpClientError | Schema.SchemaError>
      >()
      expect(client.topHealth()).type.toBe<
        Effect.Effect<{ readonly ok: boolean }, HttpClientError.HttpClientError | Schema.SchemaError>
      >()
      expect(client.topHealth({ responseMode: "response-only" })).type.toBe<
        Effect.Effect<HttpClientResponse.HttpClientResponse, HttpClientError.HttpClientError>
      >()
      expect<Parameters<typeof client.topHealth>[0]>().type.toBe<
        void | { readonly sseOptions?: Sse.DecodeOptions | undefined; readonly responseMode?: ResponseMode } | undefined
      >()
      expect(client).type.not.toHaveProperty("top")
    })

    it("keeps nested and top-level methods distinct when identifiers overlap", () => {
      const NestedLookup = HttpApiEndpoint.post("lookup", "/users", {
        payload: Schema.Struct({ name: Schema.String }),
        success: Schema.Struct({ userId: Schema.String })
      })
      const TopLevelLookup = HttpApiEndpoint.get("lookup", "/lookup", {
        query: {
          token: Schema.String
        },
        success: Schema.Struct({ available: Schema.Boolean })
      })
      const Users = HttpApiGroup.make("users").add(NestedLookup)
      const Top = HttpApiGroup.make("top", { topLevel: true }).add(TopLevelLookup)

      type GeneratedClient = HttpApiClient.Client<typeof Users | typeof Top, never, never>
      const client = hole<GeneratedClient>()

      expect<keyof GeneratedClient>().type.toBe<"users" | "lookup">()
      expect<Parameters<typeof client.users.lookup>[0]>().type.toBe<
        {
          readonly payload: { readonly name: string }
          readonly sseOptions?: Sse.DecodeOptions | undefined
          readonly responseMode?: ResponseMode
        }
      >()
      expect<Parameters<typeof client.lookup>[0]>().type.toBe<
        {
          readonly query: { readonly token: string }
          readonly sseOptions?: Sse.DecodeOptions | undefined
          readonly responseMode?: ResponseMode
        }
      >()
      expect(client.users.lookup({ payload: { name: "Ada" } })).type.toBe<
        Effect.Effect<{ readonly userId: string }, HttpClientError.HttpClientError | Schema.SchemaError>
      >()
      expect(client.lookup({ query: { token: "abc" } })).type.toBe<
        Effect.Effect<{ readonly available: boolean }, HttpClientError.HttpClientError | Schema.SchemaError>
      >()
      expect(client.users.lookup).type.not.toBeCallableWith({ query: { token: "abc" } })
      expect(client.lookup).type.not.toBeCallableWith({ payload: { name: "Ada" } })
    })

    it("derives top-level methods from class-like endpoints", () => {
      class GetUser extends HttpApiEndpoint.get("getUser", "/users/:id", {
        params: {
          id: Schema.FiniteFromString
        },
        success: Schema.Struct({ id: Schema.String })
      }) {}

      const Top = HttpApiGroup.make("top", { topLevel: true }).add(GetUser)
      type GeneratedClient = HttpApiClient.Client<typeof Top, never, never>
      const client = hole<GeneratedClient>()

      expect<keyof GeneratedClient>().type.toBe<"getUser">()
      expect<Parameters<typeof client.getUser>[0]>().type.toBe<
        {
          readonly params: { readonly id: number }
          readonly sseOptions?: Sse.DecodeOptions | undefined
          readonly responseMode?: ResponseMode
        }
      >()
      expect(client.getUser({ params: { id: 1 } })).type.toBe<
        Effect.Effect<{ readonly id: string }, HttpClientError.HttpClientError | Schema.SchemaError>
      >()
      expect(client).type.not.toHaveProperty("top")
    })

    it("merges distinct endpoints from multiple top-level groups", () => {
      const Users = HttpApiGroup.make("users", { topLevel: true }).add(
        HttpApiEndpoint.get("getUser", "/users/:id", {
          params: {
            id: Schema.FiniteFromString
          },
          success: Schema.Struct({ id: Schema.String })
        })
      )
      const Health = HttpApiGroup.make("system", { topLevel: true }).add(
        HttpApiEndpoint.get("health", "/health", {
          success: Schema.Struct({ ok: Schema.Boolean })
        })
      )

      type GeneratedClient = HttpApiClient.Client<typeof Users | typeof Health, never, never>
      const client = hole<GeneratedClient>()

      expect<keyof GeneratedClient>().type.toBe<"getUser" | "health">()
      expect<Parameters<typeof client.getUser>[0]>().type.toBe<
        {
          readonly params: { readonly id: number }
          readonly sseOptions?: Sse.DecodeOptions | undefined
          readonly responseMode?: ResponseMode
        }
      >()
      expect<Parameters<typeof client.health>[0]>().type.toBe<
        void | { readonly sseOptions?: Sse.DecodeOptions | undefined; readonly responseMode?: ResponseMode } | undefined
      >()
      expect(client.getUser({ params: { id: 1 } })).type.toBe<
        Effect.Effect<{ readonly id: string }, HttpClientError.HttpClientError | Schema.SchemaError>
      >()
      expect(client.health()).type.toBe<
        Effect.Effect<{ readonly ok: boolean }, HttpClientError.HttpClientError | Schema.SchemaError>
      >()
      expect(client).type.not.toHaveProperty("users")
      expect(client).type.not.toHaveProperty("system")
    })
  })

  describe("Client.Group", () => {
    it("derives a group client from a concrete group", () => {
      const Users = HttpApiGroup.make("users")
        .add(
          HttpApiEndpoint.get("getUser", "/users/:id", {
            params: {
              id: Schema.FiniteFromString
            },
            success: Schema.Struct({ id: Schema.String })
          })
        )

      type UsersClient = HttpApiClient.Client.Group<typeof Users, never, never>
      const client = hole<UsersClient>()

      expect<keyof UsersClient>().type.toBe<"getUser">()
      expect<Parameters<typeof client.getUser>[0]>().type.toBe<
        {
          readonly params: { readonly id: number }
          readonly sseOptions?: Sse.DecodeOptions | undefined
          readonly responseMode?: ResponseMode
        }
      >()
      expect(client.getUser({ params: { id: 1 } })).type.toBe<
        Effect.Effect<{ readonly id: string }, HttpClientError.HttpClientError | Schema.SchemaError>
      >()
    })

    it("derives methods from class-like endpoints", () => {
      class GetUser extends HttpApiEndpoint.get("getUser", "/users/:id", {
        params: {
          id: Schema.FiniteFromString
        },
        success: Schema.Struct({ id: Schema.String })
      }) {}

      const Users = HttpApiGroup.make("users").add(GetUser)
      type UsersClient = HttpApiClient.Client.Group<typeof Users, never, never>
      const client = hole<UsersClient>()

      expect<keyof UsersClient>().type.toBe<"getUser">()
      expect<Parameters<typeof client.getUser>[0]>().type.toBe<
        {
          readonly params: { readonly id: number }
          readonly sseOptions?: Sse.DecodeOptions | undefined
          readonly responseMode?: ResponseMode
        }
      >()
      expect(client.getUser({ params: { id: 1 } })).type.toBe<
        Effect.Effect<{ readonly id: string }, HttpClientError.HttpClientError | Schema.SchemaError>
      >()
    })
  })

  describe("group", () => {
    it("selects one group when endpoint identifiers overlap", () => {
      const UsersLookup = HttpApiEndpoint.get("lookup", "/users/:userId", {
        params: {
          userId: Schema.String
        },
        success: Schema.Struct({ userId: Schema.String })
      })
      const AdminsLookup = HttpApiEndpoint.get("lookup", "/admins", {
        query: {
          email: Schema.String
        },
        success: Schema.Struct({ adminId: Schema.String })
      })
      const Api = HttpApi.make("Api").add(
        HttpApiGroup.make("users").add(UsersLookup),
        HttpApiGroup.make("admins").add(AdminsLookup)
      )
      const httpClient = HttpClient.make(() => Effect.die("not used"))
      const usersClient = HttpApiClient.group(Api, { group: "users", httpClient })
      const adminsClient = HttpApiClient.group(Api, { group: "admins", httpClient })
      const selectedUsers = hole<Effect.Success<typeof usersClient>>()
      const selectedAdmins = hole<Effect.Success<typeof adminsClient>>()

      expect<keyof Effect.Success<typeof usersClient>>().type.toBe<"lookup">()
      expect<keyof Effect.Success<typeof adminsClient>>().type.toBe<"lookup">()
      expect<Parameters<typeof selectedUsers.lookup>[0]>().type.toBe<
        {
          readonly params: { readonly userId: string }
          readonly sseOptions?: Sse.DecodeOptions | undefined
          readonly responseMode?: ResponseMode
        }
      >()
      expect<Parameters<typeof selectedAdmins.lookup>[0]>().type.toBe<
        {
          readonly query: { readonly email: string }
          readonly sseOptions?: Sse.DecodeOptions | undefined
          readonly responseMode?: ResponseMode
        }
      >()
      expect(selectedUsers.lookup).type.not.toBeCallableWith({ query: { email: "admin@example.com" } })
      expect(selectedAdmins.lookup).type.not.toBeCallableWith({ params: { userId: "1" } })
    })
  })

  describe("headers", () => {
    it("derives request headers from a field record", () => {
      const Api = HttpApi.make("Api")
        .add(
          HttpApiGroup.make("group")
            .add(
              HttpApiEndpoint.get("a", "/a", {
                headers: {
                  id: Schema.FiniteFromString
                }
              })
            )
        )
      const client = Effect.runSync(
        HttpApiClient.make(Api).pipe(Effect.provide(FetchHttpClient.layer))
      )
      const f = client.group.a
      expect<Parameters<typeof f>[0]>().type.toBe<
        {
          readonly headers: { readonly id: number }
          readonly sseOptions?: Sse.DecodeOptions | undefined
          readonly responseMode?: ResponseMode
        }
      >()
    })
  })

  describe("payload", () => {
    it("defaults requests without a payload to void", () => {
      const Api = HttpApi.make("Api")
        .add(
          HttpApiGroup.make("group")
            .add(
              HttpApiEndpoint.get("a", "/a")
            )
        )
      const client = Effect.runSync(
        HttpApiClient.make(Api).pipe(Effect.provide(FetchHttpClient.layer))
      )
      const f = client.group.a
      expect<Parameters<typeof f>[0]>().type.toBe<
        void | { readonly sseOptions?: Sse.DecodeOptions | undefined; readonly responseMode?: ResponseMode } | undefined
      >()
    })

    it("derives the request payload from a field record", () => {
      const Api = HttpApi.make("Api")
        .add(
          HttpApiGroup.make("group")
            .add(
              HttpApiEndpoint.get("a", "/a", {
                payload: {
                  id: Schema.FiniteFromString
                }
              })
            )
        )
      const client = Effect.runSync(
        HttpApiClient.make(Api).pipe(Effect.provide(FetchHttpClient.layer))
      )
      const f = client.group.a
      expect<Parameters<typeof f>[0]>().type.toBe<
        {
          readonly payload: { readonly id: number }
          readonly sseOptions?: Sse.DecodeOptions | undefined
          readonly responseMode?: ResponseMode
        }
      >()
    })

    it("uses FormData for multipart payloads", () => {
      const Api = HttpApi.make("Api")
        .add(
          HttpApiGroup.make("group")
            .add(
              HttpApiEndpoint.post("a", "/a", {
                payload: Schema.String.pipe(HttpApiSchema.asMultipart())
              })
            )
        )
      const client = Effect.runSync(
        HttpApiClient.make(Api).pipe(Effect.provide(FetchHttpClient.layer))
      )
      const f = client.group.a
      expect<Parameters<typeof f>[0]>().type.toBe<
        {
          readonly payload: FormData
          readonly sseOptions?: Sse.DecodeOptions | undefined
          readonly responseMode?: ResponseMode
        }
      >()
    })

    it("uses FormData for streaming multipart payloads", () => {
      const Api = HttpApi.make("Api")
        .add(
          HttpApiGroup.make("group")
            .add(
              HttpApiEndpoint.post("a", "/a", {
                payload: Schema.String.pipe(HttpApiSchema.asMultipartStream())
              })
            )
        )
      const client = Effect.runSync(
        HttpApiClient.make(Api).pipe(Effect.provide(FetchHttpClient.layer))
      )
      const f = client.group.a
      expect<Parameters<typeof f>[0]>().type.toBe<
        {
          readonly payload: FormData
          readonly sseOptions?: Sse.DecodeOptions | undefined
          readonly responseMode?: ResponseMode
        }
      >()
    })
  })

  describe("success", () => {
    it("decodes a success schema", () => {
      const Api = HttpApi.make("Api")
        .add(
          HttpApiGroup.make("group")
            .add(
              HttpApiEndpoint.get("a", "/a", {
                success: Schema.Struct({ a: Schema.FiniteFromString })
              })
            )
        )
      const client = Effect.runSync(
        HttpApiClient.make(Api).pipe(Effect.provide(FetchHttpClient.layer))
      )
      expect(client.group.a()).type.toBe<
        Effect.Effect<
          { readonly a: number },
          HttpClientError.HttpClientError | Schema.SchemaError
        >
      >()
    })

    it("decodes multiple success schemas", () => {
      const Api = HttpApi.make("Api")
        .add(
          HttpApiGroup.make("group")
            .add(
              HttpApiEndpoint.get("a", "/a", {
                success: [
                  Schema.Struct({ a: Schema.Finite }), // application/json
                  Schema.String.pipe(HttpApiSchema.asText()), // text/plain
                  Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array()) // application/octet-stream
                ]
              })
            )
        )
      const client = Effect.runSync(
        HttpApiClient.make(Api).pipe(Effect.provide(FetchHttpClient.layer))
      )
      expect(client.group.a()).type.toBe<
        Effect.Effect<
          | string
          | { readonly a: number }
          | Uint8Array<ArrayBufferLike>,
          HttpClientError.HttpClientError | Schema.SchemaError
        >
      >()
    })

    it("infers return types from responseMode", () => {
      const Api = HttpApi.make("Api")
        .add(
          HttpApiGroup.make("group")
            .add(
              HttpApiEndpoint.get("a", "/a", {
                success: Schema.Struct({ a: Schema.FiniteFromString })
              })
            )
        )
      const client = Effect.runSync(
        HttpApiClient.make(Api).pipe(Effect.provide(FetchHttpClient.layer))
      )
      const f = client.group.a

      expect(f({ responseMode: "decoded-only" })).type.toBe<
        Effect.Effect<
          { readonly a: number },
          HttpClientError.HttpClientError | Schema.SchemaError
        >
      >()

      expect(f({ responseMode: "decoded-and-response" })).type.toBe<
        Effect.Effect<
          [{ readonly a: number }, HttpClientResponse.HttpClientResponse],
          HttpClientError.HttpClientError | Schema.SchemaError
        >
      >()

      expect(f({ responseMode: "response-only" })).type.toBe<
        Effect.Effect<HttpClientResponse.HttpClientResponse, HttpClientError.HttpClientError>
      >()
    })

    it("preserves method parameters across response modes", () => {
      const Api = HttpApi.make("Api")
        .add(
          HttpApiGroup.make("group")
            .add(
              HttpApiEndpoint.get("a", "/a/:id", {
                params: {
                  id: Schema.FiniteFromString
                },
                success: Schema.Struct({ a: Schema.FiniteFromString })
              })
            )
        )
      const client = Effect.runSync(
        HttpApiClient.make(Api).pipe(Effect.provide(FetchHttpClient.layer))
      )
      const f = client.group.a

      type Request = Parameters<typeof f>[0]
      expect<Request>().type.toBe<
        {
          readonly params: { readonly id: number }
          readonly sseOptions?: Sse.DecodeOptions | undefined
          readonly responseMode?: ResponseMode
        }
      >()
      expect(f).type.toBeCallableWith({ params: { id: 1 } })
      expect(f).type.toBeCallableWith({ params: { id: 1 }, responseMode: "decoded-only" })
      expect(f).type.toBeCallableWith({ params: { id: 1 }, responseMode: "decoded-and-response" })
      expect(f).type.toBeCallableWith({ params: { id: 1 }, responseMode: "response-only" })
      expect(f).type.not.toBeCallableWith({ params: { id: "1" } })
    })

    it("preserves responseMode inference for generic callers", () => {
      const Api = HttpApi.make("Api")
        .add(
          HttpApiGroup.make("group")
            .add(
              HttpApiEndpoint.get("a", "/a", {
                success: Schema.Struct({ a: Schema.FiniteFromString })
              })
            )
        )
      const client = Effect.runSync(
        HttpApiClient.make(Api).pipe(Effect.provide(FetchHttpClient.layer))
      )
      const f = client.group.a

      const call = <Mode extends ResponseMode>(mode: Mode) => f({ responseMode: mode })
      expect(call).type.toBeAssignableTo<
        <Mode extends ResponseMode>(
          mode: Mode
        ) => Effect.Effect<
          HttpApiClient.Client.Response<{ readonly a: number }, Mode>,
          | HttpClientError.HttpClientError
          | ([Mode] extends ["response-only"] ? never : Schema.SchemaError),
          never
        >
      >()
    })

    it("returns decoded streams for StreamSse successes", () => {
      const Api = HttpApi.make("Api")
        .add(
          HttpApiGroup.make("group")
            .add(
              HttpApiEndpoint.get("a", "/a", {
                success: HttpApiSchema.StreamSse({
                  events: Schema.Struct({
                    event: Schema.Literal("user.created"),
                    data: Schema.String
                  }),
                  error: Schema.Struct({ reason: Schema.String })
                })
              })
            )
        )
      const client = Effect.runSync(
        HttpApiClient.make(Api).pipe(Effect.provide(FetchHttpClient.layer))
      )
      const f = client.group.a
      const sseOptions = hole<Sse.DecodeOptions>()

      type Event = { readonly event: "user.created"; readonly data: string }
      type StreamError = { readonly reason: string }
      type ClientStream = Stream.Stream<
        Event,
        StreamError | HttpClientError.HttpClientError | Schema.SchemaError | Sse.Retry | Sse.SseError
      >

      expect<Parameters<typeof f>[0]>().type.toBe<
        void | { readonly sseOptions?: Sse.DecodeOptions | undefined; readonly responseMode?: ResponseMode } | undefined
      >()
      expect(f).type.not.toBeCallableWith({}, { sseOptions: {} })
      expect(f()).type.toBe<
        Effect.Effect<ClientStream, HttpClientError.HttpClientError | Schema.SchemaError>
      >()
      expect(f({ sseOptions })).type.toBe<
        Effect.Effect<ClientStream, HttpClientError.HttpClientError | Schema.SchemaError>
      >()
      expect(f({ responseMode: "decoded-only" })).type.toBe<
        Effect.Effect<ClientStream, HttpClientError.HttpClientError | Schema.SchemaError>
      >()
      expect(f({ responseMode: "decoded-and-response" })).type.toBe<
        Effect.Effect<
          [ClientStream, HttpClientResponse.HttpClientResponse],
          HttpClientError.HttpClientError | Schema.SchemaError
        >
      >()
      expect(f({ responseMode: "decoded-and-response", sseOptions })).type.toBe<
        Effect.Effect<
          [ClientStream, HttpClientResponse.HttpClientResponse],
          HttpClientError.HttpClientError | Schema.SchemaError
        >
      >()
      expect(f({ responseMode: "response-only" })).type.toBe<
        Effect.Effect<HttpClientResponse.HttpClientResponse, HttpClientError.HttpClientError>
      >()
      expect(f).type.not.toBeCallableWith({ sseOptions: { maxEventSize: "4" } })
    })

    it("widens only the body stream errors for WithHeaders StreamSse successes", () => {
      const Api = HttpApi.make("Api")
        .add(
          HttpApiGroup.make("group")
            .add(
              HttpApiEndpoint.get("a", "/a", {
                success: HttpApiSchema.WithHeaders(
                  HttpApiSchema.StreamSse({
                    data: Schema.Struct({ id: Schema.String }),
                    error: Schema.Struct({ reason: Schema.String })
                  }),
                  { "x-count": Schema.Int }
                )
              })
            )
        )
      const client = Effect.runSync(
        HttpApiClient.make(Api).pipe(Effect.provide(FetchHttpClient.layer))
      )
      const f = client.group.a

      type ClientStream = Stream.Stream<
        { readonly id: string },
        | { readonly reason: string }
        | HttpClientError.HttpClientError
        | Schema.SchemaError
        | Sse.Retry
        | Sse.SseError
      >
      type Success = HttpApiSchema.withHeaders<ClientStream, { readonly "x-count": number }>

      expect(f()).type.toBe<
        Effect.Effect<Success, HttpClientError.HttpClientError | Schema.SchemaError>
      >()
      expect(f({ responseMode: "decoded-and-response" })).type.toBe<
        Effect.Effect<
          [Success, HttpClientResponse.HttpClientResponse],
          HttpClientError.HttpClientError | Schema.SchemaError
        >
      >()
    })

    it("widens the body transport error for WithHeaders StreamUint8Array successes", () => {
      const Api = HttpApi.make("Api")
        .add(
          HttpApiGroup.make("group")
            .add(
              HttpApiEndpoint.get("a", "/a", {
                success: HttpApiSchema.WithHeaders(
                  HttpApiSchema.StreamUint8Array(),
                  { "x-count": Schema.Int }
                )
              })
            )
        )
      const client = Effect.runSync(
        HttpApiClient.make(Api).pipe(Effect.provide(FetchHttpClient.layer))
      )
      const f = client.group.a

      type Success = HttpApiSchema.withHeaders<
        Stream.Stream<Uint8Array, HttpClientError.HttpClientError>,
        { readonly "x-count": number }
      >

      expect(f()).type.toBe<
        Effect.Effect<Success, HttpClientError.HttpClientError | Schema.SchemaError>
      >()
    })

    it("returns decoded data streams for StreamSse data successes", () => {
      const Api = HttpApi.make("Api")
        .add(
          HttpApiGroup.make("group")
            .add(
              HttpApiEndpoint.get("a", "/a", {
                success: HttpApiSchema.StreamSse({
                  data: Schema.Struct({ id: Schema.String }),
                  error: Schema.Struct({ reason: Schema.String })
                })
              })
            )
        )
      const client = Effect.runSync(
        HttpApiClient.make(Api).pipe(Effect.provide(FetchHttpClient.layer))
      )
      const f = client.group.a

      type Data = { readonly id: string }
      type StreamError = { readonly reason: string }
      type ClientStream = Stream.Stream<
        Data,
        StreamError | HttpClientError.HttpClientError | Schema.SchemaError | Sse.Retry | Sse.SseError
      >

      expect(f()).type.toBe<
        Effect.Effect<ClientStream, HttpClientError.HttpClientError | Schema.SchemaError>
      >()
      expect(f({ responseMode: "decoded-and-response" })).type.toBe<
        Effect.Effect<
          [ClientStream, HttpClientResponse.HttpClientResponse],
          HttpClientError.HttpClientError | Schema.SchemaError
        >
      >()
    })

    it("omits typed stream errors when the StreamSse error schema is omitted", () => {
      const Api = HttpApi.make("Api")
        .add(
          HttpApiGroup.make("group")
            .add(
              HttpApiEndpoint.get("a", "/a", {
                success: HttpApiSchema.StreamSse({
                  data: Schema.Struct({ id: Schema.String })
                })
              })
            )
        )
      const client = Effect.runSync(
        HttpApiClient.make(Api).pipe(Effect.provide(FetchHttpClient.layer))
      )
      const f = client.group.a

      type Data = { readonly id: string }
      type ClientStream = Stream.Stream<
        Data,
        HttpClientError.HttpClientError | Schema.SchemaError | Sse.Retry | Sse.SseError
      >

      expect(f()).type.toBe<
        Effect.Effect<ClientStream, HttpClientError.HttpClientError | Schema.SchemaError>
      >()
      expect(f({ responseMode: "decoded-and-response" })).type.toBe<
        Effect.Effect<
          [ClientStream, HttpClientResponse.HttpClientResponse],
          HttpClientError.HttpClientError | Schema.SchemaError
        >
      >()
    })

    it("returns decoded streams for StreamUint8Array successes", () => {
      const Api = HttpApi.make("Api")
        .add(
          HttpApiGroup.make("group")
            .add(
              HttpApiEndpoint.get("a", "/a", {
                success: HttpApiSchema.StreamUint8Array()
              })
            )
        )
      const client = Effect.runSync(
        HttpApiClient.make(Api).pipe(Effect.provide(FetchHttpClient.layer))
      )
      const f = client.group.a

      type ClientStream = Stream.Stream<Uint8Array, HttpClientError.HttpClientError>

      expect(f()).type.toBe<
        Effect.Effect<ClientStream, HttpClientError.HttpClientError | Schema.SchemaError>
      >()
      expect(f({ responseMode: "decoded-and-response" })).type.toBe<
        Effect.Effect<
          [ClientStream, HttpClientResponse.HttpClientResponse],
          HttpClientError.HttpClientError | Schema.SchemaError
        >
      >()
      expect(f({ responseMode: "response-only" })).type.toBe<
        Effect.Effect<HttpClientResponse.HttpClientResponse, HttpClientError.HttpClientError>
      >()
    })

    it("omits StreamSse decoding services in response-only mode", () => {
      type Event = { readonly event: "user.created"; readonly data: string }
      type StreamError = { readonly reason: string }

      const Events = hole<Schema.Codec<Event, Event, "EventsDecoding", never>>()
      const Error = hole<Schema.Codec<StreamError, StreamError, "ErrorDecoding", never>>()
      const Api = HttpApi.make("Api")
        .add(
          HttpApiGroup.make("group")
            .add(
              HttpApiEndpoint.get("a", "/a", {
                success: HttpApiSchema.StreamSse({ events: Events, error: Error })
              })
            )
        )
      const client = Effect.runSync(
        HttpApiClient.make(Api).pipe(Effect.provide(FetchHttpClient.layer))
      )
      const f = client.group.a

      type ClientStream = Stream.Stream<
        Event,
        StreamError | HttpClientError.HttpClientError | Schema.SchemaError | Sse.Retry | Sse.SseError
      >

      expect(f({ responseMode: "decoded-only" })).type.toBe<
        Effect.Effect<
          ClientStream,
          HttpClientError.HttpClientError | Schema.SchemaError,
          "EventsDecoding" | "ErrorDecoding"
        >
      >()
      expect(f({ responseMode: "response-only" })).type.toBe<
        Effect.Effect<HttpClientResponse.HttpClientResponse, HttpClientError.HttpClientError>
      >()
    })
  })

  describe("error", () => {
    it("defaults to client and schema errors", () => {
      const Api = HttpApi.make("Api")
        .add(
          HttpApiGroup.make("group")
            .add(
              HttpApiEndpoint.get("a", "/a")
            )
        )
      const client = Effect.runSync(
        HttpApiClient.make(Api).pipe(Effect.provide(FetchHttpClient.layer))
      )
      expect(client.group.a()).type.toBe<
        Effect.Effect<
          void,
          | HttpClientError.HttpClientError
          | Schema.SchemaError
        >
      >()
    })

    it("includes errors decoded from the endpoint schema", () => {
      const Api = HttpApi.make("Api")
        .add(
          HttpApiGroup.make("group")
            .add(
              HttpApiEndpoint.get("a", "/a", {
                error: Schema.Struct({ a: Schema.FiniteFromString })
              })
            )
        )
      const client = Effect.runSync(
        HttpApiClient.make(Api).pipe(Effect.provide(FetchHttpClient.layer))
      )
      expect(client.group.a()).type.toBe<
        Effect.Effect<
          void,
          | { readonly a: number }
          | HttpClientError.HttpClientError
          | Schema.SchemaError
        >
      >()
    })
  })

  describe("makeWith", () => {
    it("normalizes the default HttpClientError for generic clients", () => {
      const makeClient = <ApiId extends string, Groups extends HttpApiGroup.Constraint>(
        api: HttpApi.HttpApi<ApiId, Groups>,
        httpClient: HttpClient.HttpClient
      ): Effect.Effect<
        HttpApiClient.Client<Groups>,
        never,
        HttpApiGroup.MiddlewareClient<Groups>
      > => HttpApiClient.makeWith(api, { httpClient })

      expect(makeClient).type.toBeCallableWith(
        hole<HttpApi.HttpApi<string, HttpApiGroup.Constraint>>(),
        hole<HttpClient.HttpClient>()
      )
    })

    it("preserves custom client errors when normalizing HttpClientError", () => {
      class CustomClientError extends Schema.Error<CustomClientError>("CustomClientError")({
        _tag: Schema.tag("CustomClientError")
      }) {}

      const makeClient = <ApiId extends string, Groups extends HttpApiGroup.Constraint>(
        api: HttpApi.HttpApi<ApiId, Groups>,
        httpClient: HttpClient.HttpClient.With<HttpClientError.HttpClientError | CustomClientError>
      ): Effect.Effect<
        HttpApiClient.Client<Groups, CustomClientError>,
        never,
        HttpApiGroup.MiddlewareClient<Groups>
      > => HttpApiClient.makeWith(api, { httpClient })

      expect(makeClient).type.toBeCallableWith(
        hole<HttpApi.HttpApi<string, HttpApiGroup.Constraint>>(),
        hole<HttpClient.HttpClient.With<HttpClientError.HttpClientError | CustomClientError>>()
      )
    })
  })

  describe("endpoint", () => {
    it("selects an endpoint and preserves its request and response types", () => {
      const User = Schema.Struct({
        id: Schema.String,
        age: Schema.FiniteFromString
      })

      const Api = HttpApi.make("Api")
        .add(
          HttpApiGroup.make("users")
            .add(
              HttpApiEndpoint.get("getUser", "/users/:id", {
                params: {
                  id: Schema.String
                },
                query: {
                  page: Schema.FiniteFromString
                },
                success: User
              }),
              HttpApiEndpoint.get("searchUsers", "/users", {
                query: {
                  q: Schema.String
                },
                success: Schema.Array(User)
              })
            )
        )

      const TestHttpClient = HttpClient.make(() => Effect.die("not used"))
      const getUser = Effect.runSync(
        HttpApiClient.endpoint(Api, { group: "users", endpoint: "getUser", httpClient: TestHttpClient })
      )

      expect<Parameters<typeof getUser>[0]>().type.toBe<
        {
          readonly params: { readonly id: string }
          readonly query: { readonly page: number }
          readonly sseOptions?: Sse.DecodeOptions | undefined
          readonly responseMode?: ResponseMode
        }
      >()
      const sseOptions = hole<Sse.DecodeOptions>()

      expect(getUser({ params: { id: "1" }, query: { page: 1 } })).type.toBe<
        Effect.Effect<
          { readonly id: string; readonly age: number },
          HttpClientError.HttpClientError | Schema.SchemaError
        >
      >()
      expect(getUser({ params: { id: "1" }, query: { page: 1 }, sseOptions })).type.toBe<
        Effect.Effect<
          { readonly id: string; readonly age: number },
          HttpClientError.HttpClientError | Schema.SchemaError
        >
      >()
      expect(getUser({ params: { id: "1" }, query: { page: 1 }, responseMode: "decoded-and-response" })).type.toBe<
        Effect.Effect<
          [{ readonly id: string; readonly age: number }, HttpClientResponse.HttpClientResponse],
          HttpClientError.HttpClientError | Schema.SchemaError
        >
      >()
      expect(getUser({ params: { id: "1" }, query: { page: 1 }, responseMode: "response-only" })).type.toBe<
        Effect.Effect<HttpClientResponse.HttpClientResponse, HttpClientError.HttpClientError>
      >()
      expect(getUser).type.not.toBeCallableWith({ query: { q: "Ada" } })

      const searchUsers = Effect.runSync(
        HttpApiClient.endpoint(Api, { group: "users", endpoint: "searchUsers", httpClient: TestHttpClient })
      )

      expect<Parameters<typeof searchUsers>[0]>().type.toBe<
        {
          readonly query: { readonly q: string }
          readonly sseOptions?: Sse.DecodeOptions | undefined
          readonly responseMode?: ResponseMode
        }
      >()
      expect(searchUsers).type.not.toBeCallableWith({ params: { id: "1" }, query: { page: 1 } })
    })

    it("selects class-like endpoints", () => {
      class GetUser extends HttpApiEndpoint.get("getUser", "/users/:id", {
        params: {
          id: Schema.FiniteFromString
        },
        success: Schema.Struct({ id: Schema.String })
      }) {}

      const Api = HttpApi.make("Api").add(HttpApiGroup.make("users").add(GetUser))
      const httpClient = HttpClient.make(() => Effect.die("not used"))
      const endpointClient = HttpApiClient.endpoint(Api, {
        group: "users",
        endpoint: "getUser",
        httpClient
      })
      const getUser = hole<Effect.Success<typeof endpointClient>>()

      expect<Parameters<typeof getUser>[0]>().type.toBe<
        {
          readonly params: { readonly id: number }
          readonly sseOptions?: Sse.DecodeOptions | undefined
          readonly responseMode?: ResponseMode
        }
      >()
      expect(getUser({ params: { id: 1 } })).type.toBe<
        Effect.Effect<{ readonly id: string }, HttpClientError.HttpClientError | Schema.SchemaError>
      >()
    })

    it("selects within the requested group when endpoint identifiers overlap", () => {
      class UsersEndpointError extends Schema.TaggedError<UsersEndpointError>()("UsersEndpointError", {}) {}
      class AdminsEndpointError extends Schema.TaggedError<AdminsEndpointError>()("AdminsEndpointError", {}) {}
      class UsersClientError extends Schema.TaggedError<UsersClientError>()("UsersClientError", {}) {}
      class AdminsClientError extends Schema.TaggedError<AdminsClientError>()("AdminsClientError", {}) {}

      class UsersMiddleware extends HttpApiMiddleware.Service<UsersMiddleware, {
        clientError: UsersClientError
      }>()("UsersMiddleware", {
        error: Schema.Literal("users-middleware-error"),
        requiredForClient: true
      }) {}
      class AdminsMiddleware extends HttpApiMiddleware.Service<AdminsMiddleware, {
        clientError: AdminsClientError
      }>()("AdminsMiddleware", {
        error: Schema.Literal("admins-middleware-error"),
        requiredForClient: true
      }) {}

      const UsersLookup = HttpApiEndpoint.post("lookup", "/users/:userId", {
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
        success: Schema.Struct({ userId: Schema.String, name: Schema.String }),
        error: UsersEndpointError
      }).middleware(UsersMiddleware)
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
        success: Schema.Struct({ adminId: Schema.Number, role: Schema.String }),
        error: AdminsEndpointError
      }).middleware(AdminsMiddleware)
      const Api = HttpApi.make("Api").add(
        HttpApiGroup.make("users").add(UsersLookup),
        HttpApiGroup.make("admins").add(AdminsLookup)
      )
      const httpClient = HttpClient.make(() => Effect.die("not used"))

      const usersEndpoint = HttpApiClient.endpoint(Api, {
        group: "users",
        endpoint: "lookup",
        httpClient
      })
      const adminsEndpoint = HttpApiClient.endpoint(Api, {
        group: "admins",
        endpoint: "lookup",
        httpClient
      })
      const usersMethod = hole<Effect.Success<typeof usersEndpoint>>()
      const adminsMethod = hole<Effect.Success<typeof adminsEndpoint>>()

      expect<Effect.Services<typeof usersEndpoint>>().type.toBe<HttpApiMiddleware.ForClient<UsersMiddleware>>()
      expect<Effect.Services<typeof adminsEndpoint>>().type.toBe<HttpApiMiddleware.ForClient<AdminsMiddleware>>()
      expect<Parameters<typeof usersMethod>[0]>().type.toBe<
        {
          readonly params: { readonly userId: string }
          readonly query: { readonly page: number }
          readonly payload: { readonly name: string }
          readonly headers: { readonly "x-user": string }
          readonly sseOptions?: Sse.DecodeOptions | undefined
          readonly responseMode?: ResponseMode
        }
      >()
      expect<Parameters<typeof adminsMethod>[0]>().type.toBe<
        {
          readonly params: { readonly adminId: number }
          readonly query: { readonly scope: string }
          readonly payload: { readonly role: "admin" }
          readonly headers: { readonly "x-admin": string }
          readonly sseOptions?: Sse.DecodeOptions | undefined
          readonly responseMode?: ResponseMode
        }
      >()
      expect(usersMethod({
        params: { userId: "1" },
        query: { page: 1 },
        payload: { name: "Ada" },
        headers: { "x-user": "user" }
      })).type.toBe<
        Effect.Effect<
          { readonly userId: string; readonly name: string },
          | UsersEndpointError
          | UsersClientError
          | "users-middleware-error"
          | HttpClientError.HttpClientError
          | Schema.SchemaError
        >
      >()
      expect(adminsMethod({
        params: { adminId: 1 },
        query: { scope: "all" },
        payload: { role: "admin" },
        headers: { "x-admin": "admin" }
      })).type.toBe<
        Effect.Effect<
          { readonly adminId: number; readonly role: string },
          | AdminsEndpointError
          | AdminsClientError
          | "admins-middleware-error"
          | HttpClientError.HttpClientError
          | Schema.SchemaError
        >
      >()
      expect(usersMethod).type.not.toBeCallableWith({
        params: { adminId: 1 },
        query: { scope: "all" },
        payload: { role: "admin" },
        headers: { "x-admin": "admin" }
      })
      expect(adminsMethod).type.not.toBeCallableWith({
        params: { userId: "1" },
        query: { page: 1 },
        payload: { name: "Ada" },
        headers: { "x-user": "user" }
      })
    })

    it("rejects unknown group identifiers", () => {
      const Api = HttpApi.make("Api").add(
        HttpApiGroup.make("users").add(HttpApiEndpoint.get("getUser", "/users/:id"))
      )
      const httpClient = HttpClient.make(() => Effect.die("not used"))

      expect(HttpApiClient.endpoint).type.not.toBeCallableWith(Api, {
        group: "missing",
        endpoint: "getUser",
        httpClient
      })
    })

    it("rejects unknown endpoint identifiers", () => {
      const Api = HttpApi.make("Api").add(
        HttpApiGroup.make("users").add(HttpApiEndpoint.get("getUser", "/users/:id"))
      )
      const httpClient = HttpClient.make(() => Effect.die("not used"))

      expect(HttpApiClient.endpoint).type.not.toBeCallableWith(Api, {
        group: "users",
        endpoint: "missing",
        httpClient
      })
    })

    it("preserves custom HTTP client errors and requirements", () => {
      interface CustomService {
        readonly customService: "customService"
      }

      class CustomClientError extends Schema.Error<CustomClientError>("CustomClientError")({
        _tag: Schema.tag("CustomClientError")
      }) {}

      const Api = HttpApi.make("Api")
        .add(
          HttpApiGroup.make("users")
            .add(
              HttpApiEndpoint.get("getUser", "/users/:id", {
                params: {
                  id: Schema.String
                },
                success: Schema.String
              })
            )
        )

      const httpClient = hole<HttpClient.HttpClient.With<CustomClientError, CustomService>>()
      const getUser = Effect.runSync(
        HttpApiClient.endpoint(Api, {
          group: "users",
          endpoint: "getUser",
          httpClient,
          transformClient: (client) => {
            expect(client).type.toBe<HttpClient.HttpClient.With<CustomClientError, CustomService>>()
            return client
          }
        })
      )

      expect(getUser({ params: { id: "1" } })).type.toBe<
        Effect.Effect<
          string,
          CustomClientError | HttpClientError.HttpClientError | Schema.SchemaError,
          CustomService
        >
      >()
    })
  })

  describe("client middleware", () => {
    it("requires layers and includes errors for required client middleware", () => {
      class RequiredClientError extends Schema.Error<RequiredClientError>("RequiredClientError")({
        _tag: Schema.tag("RequiredClientError")
      }) {}

      class OptionalClientError extends Schema.Error<OptionalClientError>("OptionalClientError")({
        _tag: Schema.tag("OptionalClientError")
      }) {}

      class RequiredMiddleware extends HttpApiMiddleware.Service<RequiredMiddleware, {
        clientError: RequiredClientError
      }>()("RequiredMiddleware", {
        requiredForClient: true
      }) {}

      class OptionalMiddleware extends HttpApiMiddleware.Service<OptionalMiddleware, {
        clientError: OptionalClientError
      }>()("OptionalMiddleware") {}

      const Api = HttpApi.make("Api")
        .add(
          HttpApiGroup.make("group")
            .add(
              HttpApiEndpoint.get("a", "/a", {
                success: Schema.String
              })
                .middleware(RequiredMiddleware)
                .middleware(OptionalMiddleware)
            )
        )

      const client = Effect.runSync(
        HttpApiClient.make(Api).pipe(
          Effect.provide([
            FetchHttpClient.layer,
            HttpApiMiddleware.layerClient(RequiredMiddleware, ({ next, request }) => next(request))
          ])
        )
      )
      expect(client.group.a()).type.toBe<
        Effect.Effect<
          string,
          | RequiredClientError
          | HttpClientError.HttpClientError
          | Schema.SchemaError
        >
      >()

      expect(Effect.runSync).type.not.toBeCallableWith(
        HttpApiClient.make(Api).pipe(Effect.provide(FetchHttpClient.layer))
      )
    })

    it("enforces required middleware for makeWith, group, and endpoint", () => {
      class RequiredClientError extends Schema.Error<RequiredClientError>("RequiredClientError")({
        _tag: Schema.tag("RequiredClientError")
      }) {}

      class RequiredMiddleware extends HttpApiMiddleware.Service<RequiredMiddleware, {
        clientError: RequiredClientError
      }>()("RequiredMiddleware", {
        requiredForClient: true
      }) {}

      const Api = HttpApi.make("Api")
        .add(
          HttpApiGroup.make("group")
            .add(
              HttpApiEndpoint.get("a", "/a", {
                success: Schema.String
              })
                .middleware(RequiredMiddleware)
            )
        )

      const TestHttpClient = HttpClient.make(() => Effect.die("not used"))

      expect(Effect.runSync).type.not.toBeCallableWith(HttpApiClient.makeWith(Api, { httpClient: TestHttpClient }))
      expect(Effect.runSync).type.not.toBeCallableWith(
        HttpApiClient.group(Api, { group: "group", httpClient: TestHttpClient })
      )
      expect(Effect.runSync).type.not.toBeCallableWith(
        HttpApiClient.endpoint(Api, { group: "group", endpoint: "a", httpClient: TestHttpClient })
      )

      const middlewareLayer = HttpApiMiddleware.layerClient(
        RequiredMiddleware,
        ({ next, request }) => next(request)
      )

      const withClient = Effect.runSync(
        HttpApiClient.makeWith(Api, { httpClient: TestHttpClient }).pipe(
          Effect.provide(middlewareLayer)
        )
      )
      const fromClient = withClient.group.a

      const withGroup = Effect.runSync(
        HttpApiClient.group(Api, { group: "group", httpClient: TestHttpClient }).pipe(
          Effect.provide(middlewareLayer)
        )
      )
      const fromGroup = withGroup.a

      const fromEndpoint = Effect.runSync(
        HttpApiClient.endpoint(Api, { group: "group", endpoint: "a", httpClient: TestHttpClient }).pipe(
          Effect.provide(middlewareLayer)
        )
      )

      expect(fromClient()).type.toBe<
        Effect.Effect<
          string,
          | RequiredClientError
          | HttpClientError.HttpClientError
          | Schema.SchemaError
        >
      >()

      expect(fromGroup()).type.toBe<
        Effect.Effect<
          string,
          | RequiredClientError
          | HttpClientError.HttpClientError
          | Schema.SchemaError
        >
      >()

      expect(fromEndpoint()).type.toBe<
        Effect.Effect<
          string,
          | RequiredClientError
          | HttpClientError.HttpClientError
          | Schema.SchemaError
        >
      >()
    })
  })
})
