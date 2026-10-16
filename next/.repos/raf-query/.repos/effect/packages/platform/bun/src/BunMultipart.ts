/**
 * Bun-specific helpers for parsing HTTP `multipart/form-data` request bodies.
 *
 * This module adapts a Bun `Request` body and headers into the shared
 * `Multipart` model. `stream` returns multipart parts as a `Stream`, while
 * `persisted` collects the form and writes file parts to scoped temporary files
 * through the current `FileSystem`, `Path`, and `Scope` services.
 *
 * @since 4.0.0
 */
import type * as Effect from "effect/Effect"
import type { FileSystem } from "effect/FileSystem"
import * as Multipart from "effect/http/Multipart"
import type { Path } from "effect/Path"
import type * as Scope from "effect/Scope"
import * as Stream from "effect/Stream"
import * as BunStream from "./BunStream.ts"

/**
 * Parses a Bun `Request` body as multipart data and returns a stream of multipart parts.
 *
 * @category constructors
 * @since 4.0.0
 */
export const stream = (source: Request): Stream.Stream<Multipart.Part, Multipart.MultipartError> =>
  BunStream.fromReadableStream({
    evaluate: () =>
      source.body ?? new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array())
          controller.close()
        }
      }),
    onError: (cause) => Multipart.MultipartError.fromReason("InternalError", cause)
  }).pipe(
    Stream.pipeThroughChannel(Multipart.makeChannel(Object.fromEntries(source.headers)))
  )

/**
 * Parses and persists multipart data from a Bun `Request`, requiring file-system, path, and scope services.
 *
 * @category constructors
 * @since 4.0.0
 */
export const persisted = (
  source: Request
): Effect.Effect<
  Multipart.Persisted,
  Multipart.MultipartError,
  | FileSystem
  | Path
  | Scope.Scope
> => Multipart.toPersisted(stream(source))
