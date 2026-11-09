// Measures chained builder handleRaw registration for 100 same-shaped endpoints in one group.
import { Effect, Schema } from "effect"
import { HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"

Schema.String
HttpApi.make("Api")
HttpApiGroup.make("users")
HttpApiEndpoint.get("warmup", "/warmup")

const Params = Schema.Struct({
  id: Schema.FiniteFromString
})

const User = Schema.Struct({
  id: Schema.String,
  name: Schema.String
})

const group = HttpApiGroup.make("users").add(
  HttpApiEndpoint.get("getUser0001", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0002", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0003", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0004", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0005", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0006", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0007", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0008", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0009", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0010", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0011", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0012", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0013", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0014", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0015", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0016", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0017", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0018", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0019", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0020", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0021", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0022", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0023", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0024", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0025", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0026", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0027", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0028", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0029", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0030", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0031", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0032", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0033", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0034", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0035", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0036", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0037", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0038", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0039", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0040", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0041", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0042", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0043", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0044", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0045", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0046", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0047", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0048", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0049", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0050", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0051", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0052", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0053", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0054", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0055", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0056", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0057", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0058", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0059", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0060", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0061", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0062", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0063", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0064", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0065", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0066", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0067", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0068", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0069", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0070", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0071", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0072", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0073", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0074", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0075", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0076", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0077", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0078", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0079", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0080", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0081", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0082", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0083", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0084", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0085", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0086", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0087", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0088", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0089", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0090", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0091", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0092", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0093", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0094", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0095", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0096", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0097", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0098", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0099", "/users/:id", {
    params: Params,
    success: User
  }),
  HttpApiEndpoint.get("getUser0100", "/users/:id", {
    params: Params,
    success: User
  })
)

const api = HttpApi.make("Api").add(group)

const layer = HttpApiBuilder.group(api, "users", (handlers) =>
  handlers
    .handleRaw("getUser0001", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0002", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0003", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0004", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0005", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0006", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0007", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0008", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0009", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0010", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0011", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0012", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0013", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0014", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0015", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0016", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0017", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0018", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0019", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0020", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0021", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0022", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0023", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0024", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0025", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0026", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0027", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0028", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0029", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0030", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0031", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0032", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0033", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0034", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0035", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0036", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0037", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0038", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0039", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0040", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0041", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0042", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0043", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0044", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0045", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0046", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0047", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0048", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0049", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0050", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0051", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0052", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0053", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0054", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0055", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0056", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0057", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0058", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0059", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0060", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0061", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0062", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0063", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0064", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0065", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0066", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0067", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0068", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0069", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0070", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0071", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0072", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0073", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0074", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0075", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0076", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0077", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0078", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0079", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0080", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0081", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0082", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0083", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0084", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0085", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0086", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0087", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0088", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0089", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0090", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0091", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0092", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0093", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0094", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0095", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0096", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0097", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0098", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0099", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      }))
    .handleRaw("getUser0100", ({ params }) =>
      Effect.succeed({
        id: String(params.id),
        name: "Ada"
      })))

export type Layer = typeof layer
export type Handlers = HttpApiBuilder.Handlers.FromGroup<typeof group>
