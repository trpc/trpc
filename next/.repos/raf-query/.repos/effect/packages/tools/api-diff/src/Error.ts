import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"

export class ApiDiffError extends Schema.TaggedError<ApiDiffError>()("ApiDiffError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect())
}) {}

export const isApiDiffError = (u: unknown): u is ApiDiffError => Predicate.isTagged(u, "ApiDiffError")
