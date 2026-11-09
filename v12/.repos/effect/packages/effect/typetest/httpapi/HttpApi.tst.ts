import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { describe, expect, it } from "tstyche"

describe("HttpApi", () => {
  describe("groups", () => {
    it("preserves group types by identifier", () => {
      const User = Schema.Struct({
        id: Schema.String
      })
      const Users = HttpApiGroup.make("users").add(
        HttpApiEndpoint.get("getUser", "/users/:id", {
          params: {
            id: Schema.String
          },
          success: User
        })
      )
      const Admin = HttpApiGroup.make("admin").add(
        HttpApiEndpoint.get("getAdmin", "/admin/:id", {
          params: {
            id: Schema.String
          },
          success: User
        })
      )
      const Api = HttpApi.make("api").add(Users, Admin)

      expect(Api.groups.users).type.toBe<typeof Users>()
      expect(Api.groups.admin).type.toBe<typeof Admin>()
      expect(Api).type.not.toBeAssignableTo<HttpApi.HttpApi<"api", typeof Users>>()
    })

    it("keeps groups distinct when endpoint identifiers overlap", () => {
      const FindUser = HttpApiEndpoint.get("find", "/users/:userId", {
        params: {
          userId: Schema.String
        },
        success: Schema.Struct({ userId: Schema.String })
      })
      const FindAdmin = HttpApiEndpoint.get("find", "/admins", {
        query: {
          email: Schema.String
        },
        success: Schema.Struct({ adminId: Schema.String })
      })
      const Users = HttpApiGroup.make("users").add(FindUser)
      const Admins = HttpApiGroup.make("admins").add(FindAdmin)
      const Api = HttpApi.make("api").add(Users, Admins)

      expect(Api.groups.users.endpoints.find).type.toBe<typeof FindUser>()
      expect(Api.groups.admins.endpoints.find).type.toBe<typeof FindAdmin>()
      expect(Api.groups).type.not.toHaveProperty("missing")

      const Prefixed = Api.prefix("/v1")

      expect(Prefixed.groups.users.endpoints.find).type.toBe<HttpApiEndpoint.AddPrefix<typeof FindUser, "/v1">>()
      expect(Prefixed.groups.admins.endpoints.find).type.toBe<HttpApiEndpoint.AddPrefix<typeof FindAdmin, "/v1">>()
    })
  })
})
