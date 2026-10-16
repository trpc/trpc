import { Context, Schema } from "effect"
import { HttpApiEndpoint, HttpApiError, HttpApiMiddleware, HttpApiSchema, HttpApiSecurity } from "effect/http-api"
import { describe, expect, it } from "tstyche"

describe("HttpApiMiddleware", () => {
  describe("Service", () => {
    it("defaults error services to never", () => {
      class M extends HttpApiMiddleware.Service<M>()("Http/Logger") {}

      expect<HttpApiMiddleware.ErrorServicesEncode<M>>().type.toBe<never>()
      expect<HttpApiMiddleware.ErrorServicesDecode<M>>().type.toBe<never>()
    })

    it("derives endpoint errors from an error schema", () => {
      class M extends HttpApiMiddleware.Service<M>()("Http/Logger", {
        error: Schema.String
      }) {}
      const endpoint = HttpApiEndpoint.get("a", "/a", {
        success: Schema.String
      }).middleware(M)
      expect(M.error).type.toBe<ReadonlySet<Schema.Top>>()
      expect<HttpApiEndpoint.MiddlewareError<typeof endpoint>>().type.toBe<string>()
      expect(M.security).type.toBe<never>()
    })

    it("preserves error services for status annotations used with pipe", () => {
      class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {}) {}
      class M extends HttpApiMiddleware.Service<M>()("Http/Logger", {
        error: NotFound.pipe(HttpApiSchema.status(404))
      }) {}

      expect<HttpApiMiddleware.ErrorServicesEncode<M>>().type.toBe<never>()
      expect<HttpApiMiddleware.ErrorServicesDecode<M>>().type.toBe<never>()
    })

    it("tracks security without adding middleware errors", () => {
      class M extends HttpApiMiddleware.Service<M>()("M", {
        security: {
          cookie: HttpApiSecurity.apiKey({
            in: "cookie",
            key: "token"
          })
        }
      }) {}
      const endpoint = HttpApiEndpoint.get("a", "/a", {
        success: Schema.String
      }).middleware(M)
      expect(M.error).type.toBe<ReadonlySet<Schema.Top>>()
      expect<HttpApiEndpoint.MiddlewareError<typeof endpoint>>().type.toBe<never>()
      expect(M.security).type.toBe<{ readonly cookie: HttpApiSecurity.ApiKey }>()
    })

    it("tracks error and security metadata together", () => {
      class M extends HttpApiMiddleware.Service<M>()("Http/Logger", {
        error: Schema.String,
        security: {
          cookie: HttpApiSecurity.apiKey({
            in: "cookie",
            key: "token"
          })
        }
      }) {}
      const endpoint = HttpApiEndpoint.get("a", "/a", {
        success: Schema.String
      }).middleware(M)
      expect(M.error).type.toBe<ReadonlySet<Schema.Top>>()
      expect<HttpApiEndpoint.MiddlewareError<typeof endpoint>>().type.toBe<string>()
      expect(M.security).type.toBe<{ readonly cookie: HttpApiSecurity.ApiKey }>()
    })

    it("derives an endpoint error union from an error schema array", () => {
      class M extends HttpApiMiddleware.Service<M>()("Http/Auth", {
        error: [HttpApiError.UnauthorizedNoContent, HttpApiError.ForbiddenNoContent]
      }) {}
      const endpoint = HttpApiEndpoint.get("a", "/a", {
        success: Schema.String
      }).middleware(M)
      expect(M.error).type.toBe<ReadonlySet<Schema.Top>>()
      expect<HttpApiEndpoint.MiddlewareError<typeof endpoint>>().type.toBe<
        HttpApiError.Unauthorized | HttpApiError.Forbidden
      >()
    })

    it("tracks endpoint middleware services", () => {
      class Token extends Context.Service<Token, {
        readonly token: string
      }>()("Token") {}

      class CurrentUser extends Context.Service<CurrentUser, {
        readonly userId: string
      }>()("CurrentUser") {}

      class NeedsUser extends HttpApiMiddleware.Service<NeedsUser, {
        requires: CurrentUser
      }>()("NeedsUser") {}

      class Auth extends HttpApiMiddleware.Service<Auth, {
        requires: Token
        provides: CurrentUser
      }>()("Auth") {}

      const endpoint = HttpApiEndpoint.get("a", "/a", {
        success: Schema.String
      })

      const needsUser = endpoint.middleware(NeedsUser)
      const authenticated = needsUser.middleware(Auth)

      expect<HttpApiEndpoint.Middleware<typeof needsUser>>().type.toBe<NeedsUser>()
      expect<HttpApiEndpoint.Middleware<typeof authenticated>>().type.toBe<NeedsUser | Auth>()
      expect<HttpApiEndpoint.MiddlewareServices<typeof needsUser>>().type.toBe<CurrentUser>()
      expect<HttpApiEndpoint.MiddlewareServices<typeof authenticated>>().type.toBe<Token>()
    })
  })
})
