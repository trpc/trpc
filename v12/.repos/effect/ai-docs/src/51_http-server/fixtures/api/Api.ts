import { HttpApi, OpenApi } from "effect/http-api"
import { SystemApi } from "./System.ts"
import { UsersApiGroup } from "./Users.ts"

// Defined the root API, which combines all of the groups together. This is the
// API that you will serve and generate clients for. You can also annotate the
// API with OpenAPI metadata.
export class Api extends HttpApi.make("user-api")
  .add(UsersApiGroup)
  .add(SystemApi)
  .annotateMerge(OpenApi.annotations({
    title: "Acme User API"
  }))
{}
