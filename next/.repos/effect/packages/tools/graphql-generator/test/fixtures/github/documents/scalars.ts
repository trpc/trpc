/**
 * The custom scalar codecs the GitHub fixture config points at:
 * `scalars: { DateTime: "./documents/scalars.ts#DateTime", URI: "./documents/scalars.ts#URI", GitObjectID: "./documents/scalars.ts#GitObjectID" }`.
 */
import * as Schema from "effect/Schema"

export const DateTime = Schema.DateTimeUtcFromString

export const URI = Schema.URLFromString

export const GitObjectID = Schema.String
