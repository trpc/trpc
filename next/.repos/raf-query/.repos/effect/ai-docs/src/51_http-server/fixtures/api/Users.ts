import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiError, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/http-api"
import { User, UserId } from "../domain/User.ts"
import { SearchQueryTooShort, UserNotFound } from "../domain/UserErrors.ts"
import { Authorization } from "./Authorization.ts"

export class UsersApiGroup extends HttpApiGroup.make("users")
  .add(
    HttpApiEndpoint.get("list", "/", {
      query: {
        search: Schema.optional(Schema.String)
      },
      // Use the `json` variant of the model for API responses. It shares the
      // field declarations with the database variants, but can encode values
      // differently where needed.
      success: Schema.Array(User.json)
    }),
    HttpApiEndpoint.get("search", "/search", {
      // For get requests, payload uses the query string
      payload: {
        search: Schema.String
      },
      success: [
        Schema.Array(User.json),
        Schema.String.pipe(HttpApiSchema.asText({
          contentType: "text/csv"
        }))
      ],
      error: [
        SearchQueryTooShort.pipe(
          // If you want an error to return no content, you can use
          // `HttpApiSchema.asNoContent` and provide a decoder that transforms the
          // error into the appropriate type.
          HttpApiSchema.asNoContent({
            decode: () => new SearchQueryTooShort()
          })
        ),
        // You can also add some of the built in `HttpApiError`s to handle common
        // error cases like bad requests, unauthorized, etc.
        HttpApiError.RequestTimeoutNoContent
      ]
    }),
    HttpApiEndpoint.get("getById", "/:id", {
      params: {
        // Path parameter values are automatically coerced from their string
        // form using `Schema.toCodecStringTree`, so schemas that decode from
        // other types (like numbers) work here as well.
        id: UserId
      },
      success: User.json,
      error: UserNotFound.pipe(
        // If you want an error to return no content, you can use
        // `HttpApiSchema.asNoContent` and provide a decoder that transforms the
        // error into the appropriate type.
        HttpApiSchema.asNoContent({
          decode: () => new UserNotFound()
        })
      )
    }),
    HttpApiEndpoint.post("create", "/", {
      // For post requests, payload uses the request body. It defaults to JSON,
      // but you can specify other content types as well using
      // `HttpApiSchema.asText`, `HttpApiSchema.asMultipart`, etc.
      //
      // The `jsonCreate` variant only exposes the fields clients are allowed
      // to provide, so the generated id and timestamps cannot be set here.
      payload: User.jsonCreate,
      success: User.json
    }),
    HttpApiEndpoint.patch("update", "/:id", {
      params: {
        id: UserId
      },
      // The `jsonUpdate` variant similarly excludes the id and the managed
      // timestamps from the update payload.
      payload: User.jsonUpdate,
      success: User.json,
      error: UserNotFound.pipe(
        HttpApiSchema.asNoContent({
          decode: () => new UserNotFound()
        })
      )
    }),
    HttpApiEndpoint.get("me", "/me", {
      success: User.json,
      error: UserNotFound.pipe(HttpApiSchema.status(404))
    })
  )
  // You can apply middleware to entire groups, which is useful for things like
  // authentication and authorization.
  //
  // You can also apply middleware to individual endpoints if you need more
  // fine-grained control.
  .middleware(Authorization)
  // To add a common prefix to all endpoints in a group, you can use the `prefix`
  // method. This is useful for grouping related endpoints together under a common
  // path segment. In this case, all endpoints in the `UsersApiGroup` will be
  // prefixed with `/users`.
  .prefix("/users")
  // You can add OpenAPI annotations to groups, endpoints, and even parameters and
  // request bodies. These will be merged together to generate the final OpenAPI
  // docs for the API
  .annotateMerge(OpenApi.annotations({
    title: "Users",
    description: "User management endpoints"
  }))
{}
