import { Context, Schema } from "effect"
import { HttpApiMiddleware, HttpApiSecurity } from "effect/http-api"
import type { User } from "../domain/User.ts"

export class CurrentUser extends Context.Service<CurrentUser, User>()("acme/HttpApi/Authorization/CurrentUser") {}

export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  "Unauthorized",
  {
    message: Schema.String
  },
  // You can define error status codes directly on the error class
  { httpApiStatus: 401 }
) {}

export class Authorization extends HttpApiMiddleware.Service<Authorization, {
  // Middleware can provide services to other middleware and endpoints, which is
  // useful for things like authentication, where you want to inject the current
  // user into the context for other endpoints to consume.
  provides: CurrentUser
  // If your middleware requires dependencies from other middleware, you can
  // specify those as well.
  requires: never
}>()("acme/HttpApi/Authorization", {
  // This middleware requires clients to also provide an implementation, to
  // inject a api key
  requiredForClient: true,
  // Middleware can optionally define security schemes, which are used to
  // generate OpenAPI docs and decode credientials from incoming requests for
  // you.
  security: {
    bearer: HttpApiSecurity.bearer
  },
  // Middlware can specify errors that it may raise
  error: Unauthorized
}) {}
