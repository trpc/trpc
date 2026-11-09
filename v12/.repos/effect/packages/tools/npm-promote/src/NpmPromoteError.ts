import * as Schema from "effect/Schema"

export class NpmPromoteError extends Schema.TaggedError<NpmPromoteError>()("NpmPromoteError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect())
}) {}

/**
 * Reading `pkg` from the registry failed while promoting. Packages after it
 * were not promoted.
 */
export class RegistryError extends Schema.TaggedError<RegistryError>()("RegistryError", {
  message: Schema.String,
  pkg: Schema.Struct({ name: Schema.String, version: Schema.String }),
  /** An earlier package needed its latest tag moved during this run. */
  promotionPending: Schema.Boolean,
  cause: Schema.optional(Schema.Defect())
}) {}

/**
 * Moving `latest` failed for `pkg`. Packages after it were not promoted.
 */
export class PromotionError extends Schema.TaggedError<PromotionError>()("PromotionError", {
  message: Schema.String,
  pkg: Schema.Struct({ name: Schema.String, version: Schema.String }),
  reason: Schema.String,
  cause: Schema.optional(Schema.Defect())
}) {}
