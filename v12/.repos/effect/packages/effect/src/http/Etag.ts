/**
 * HTTP entity tag values and metadata-based generator layers.
 *
 * ETags are validators for a specific representation of a resource. Servers put
 * them in `ETag` response headers so clients and intermediaries can revalidate
 * cached content with `If-None-Match`, or protect writes with preconditions such
 * as `If-Match`.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import type * as FileSystem from "../FileSystem.ts"
import * as Layer from "../Layer.ts"
import * as Option from "../Option.ts"
import type * as Body from "./HttpBody.ts"

/**
 * Represents an HTTP entity tag, either weak or strong.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Etag = Weak | Strong

/**
 * Weak HTTP entity tag.
 *
 * **Details**
 *
 * The `value` is the raw tag value without the surrounding quotes or `W/` prefix.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Weak {
  readonly _tag: "Weak"
  readonly value: string
}

/**
 * Strong HTTP entity tag.
 *
 * **Details**
 *
 * The `value` is the raw tag value without the surrounding quotes.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Strong {
  readonly _tag: "Strong"
  readonly value: string
}

/**
 * Formats an `Etag` as an HTTP header value, including quotes and the `W/` prefix for weak tags.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const toString = (self: Etag): string => {
  switch (self._tag) {
    case "Weak":
      return `W/"${self.value}"`
    case "Strong":
      return `"${self.value}"`
  }
}

/**
 * Service for generating ETags from filesystem file information or Web `File`-like metadata.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class Generator extends Context.Service<Generator, {
  readonly fromFileInfo: (info: FileSystem.File.Info) => Effect.Effect<Etag>
  readonly fromFileWeb: (file: Body.HttpBody.FileLike) => Effect.Effect<Etag>
}>()("effect/http/Etag/Generator") {}

const fromFileInfo = (info: FileSystem.File.Info) => {
  const mtime = Option.match(info.mtime, {
    onNone: () => "0",
    onSome: (mtime) => mtime.getTime().toString(16)
  })
  return `${info.size.toString(16)}-${mtime}`
}

const fromFileWeb = (file: Body.HttpBody.FileLike) => {
  return `${file.size.toString(16)}-${file.lastModified.toString(16)}`
}

/**
 * Layer that provides a `Generator` which produces strong ETags from file size
 * and modification time metadata.
 *
 * **When to use**
 *
 * Use when you need the `Generator` service to produce strong ETags and file
 * size plus modification time reliably change for every byte-level change.
 *
 * **Gotchas**
 *
 * This layer marks metadata-derived tags as strong. If the underlying storage
 * can update file contents without changing the recorded size or modification
 * time, those tags can stop representing byte-for-byte identity.
 *
 * @see {@link layerWeak} for weak metadata-derived ETags when byte-for-byte identity is not required
 * @see {@link Generator} for the service provided by this layer
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<Generator> = Layer.succeed(
  Generator
)({
  fromFileInfo(info) {
    return Effect.sync(() => ({ _tag: "Strong", value: fromFileInfo(info) }))
  },
  fromFileWeb(file) {
    return Effect.sync(() => ({ _tag: "Strong", value: fromFileWeb(file) }))
  }
})

/**
 * Layer that provides a `Generator` which produces weak ETags from file size and modification time metadata.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerWeak: Layer.Layer<Generator> = Layer.succeed(
  Generator
)({
  fromFileInfo(info) {
    return Effect.sync(() => ({ _tag: "Weak", value: fromFileInfo(info) }))
  },
  fromFileWeb(file) {
    return Effect.sync(() => ({ _tag: "Weak", value: fromFileWeb(file) }))
  }
})
