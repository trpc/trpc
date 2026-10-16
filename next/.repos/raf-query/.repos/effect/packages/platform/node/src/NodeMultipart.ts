/**
 * Node.js multipart parsing for HTTP `multipart/form-data` request bodies.
 *
 * `NodeMultipart` adapts a Node `Readable` plus incoming HTTP headers into
 * Effect's shared multipart model. It can expose form parts as a stream or
 * collect a complete persisted form by writing file uploads to scoped temporary
 * files through the current `FileSystem` and `Path` services. `fileToReadable`
 * returns the underlying Node readable stream for file parts produced by this
 * parser.
 *
 * @since 4.0.0
 */
import * as Effect from "effect/Effect"
import type * as FileSystem from "effect/FileSystem"
import * as Multipart from "effect/http/Multipart"
import * as MultipartParser from "effect/http/MultipartParser"
import * as Inspectable from "effect/Inspectable"
import type * as Path from "effect/Path"
import type * as Scope from "effect/Scope"
import * as Stream from "effect/Stream"
import * as NFS from "node:fs"
import type { IncomingHttpHeaders } from "node:http"
import type { Readable } from "node:stream"
import * as NodeStreamP from "node:stream/promises"
import * as MP from "./NodeMultipartParser.ts"
import * as NodeStream from "./NodeStream.ts"

/**
 * Parses multipart data from a Node readable request body and headers into a
 * stream of `Multipart.Part` values, converting parser failures to
 * `MultipartError`.
 *
 * @category constructors
 * @since 4.0.0
 */
export const stream = (
  source: Readable,
  headers: IncomingHttpHeaders
): Stream.Stream<Multipart.Part, Multipart.MultipartError> =>
  Multipart.makeConfig(headers as any).pipe(
    Effect.map((config) =>
      NodeStream.fromReadable<MP.Part, Multipart.MultipartError>({
        evaluate() {
          const parser = MP.make(config)
          source.pipe(parser)
          return parser as any
        },
        onError: (error) => convertError(error as any)
      })
    ),
    Stream.unwrap,
    Stream.map(convertPart)
  )

/**
 * Parses multipart data from a Node readable request body and persists file
 * parts using the current `FileSystem`, `Path`, and `Scope` services.
 *
 * @category constructors
 * @since 4.0.0
 */
export const persisted = (
  source: Readable,
  headers: IncomingHttpHeaders
): Effect.Effect<
  Multipart.Persisted,
  Multipart.MultipartError,
  Scope.Scope | FileSystem.FileSystem | Path.Path
> =>
  Multipart.toPersisted(stream(source, headers), (path, file) =>
    Effect.tryPromise({
      try: (signal) => NodeStreamP.pipeline((file as FileImpl).file, NFS.createWriteStream(path), { signal }),
      catch: (cause) => Multipart.MultipartError.fromReason("InternalError", cause)
    }))

/**
 * Returns the underlying Node readable stream for a multipart file produced by
 * the Node multipart parser.
 *
 * @category converting
 * @since 4.0.0
 */
export const fileToReadable = (file: Multipart.File): Readable => (file as FileImpl).file

// -----------------------------------------------------------------------------
// Internal
// -----------------------------------------------------------------------------

const convertPart = (part: MP.Part): Multipart.Part =>
  part._tag === "Field" ? new FieldImpl(part.info, part.value) : new FileImpl(part)

abstract class PartBase extends Inspectable.Class {
  readonly [Multipart.TypeId]: typeof Multipart.TypeId
  constructor() {
    super()
    this[Multipart.TypeId] = Multipart.TypeId
  }
}

class FieldImpl extends PartBase implements Multipart.Field {
  readonly _tag = "Field"
  readonly key: string
  readonly contentType: string
  readonly value: string

  constructor(
    info: MultipartParser.PartInfo,
    value: Uint8Array
  ) {
    super()
    this.key = info.name
    this.contentType = info.contentType
    this.value = MultipartParser.decodeField(info, value)
  }

  toJSON(): unknown {
    return {
      _id: "@effect/platform/Multipart/Part",
      _tag: "Field",
      key: this.key,
      value: this.value,
      contentType: this.contentType
    }
  }
}

class FileImpl extends PartBase implements Multipart.File {
  readonly _tag = "File"
  readonly key: string
  readonly name: string
  readonly contentType: string
  readonly content: Stream.Stream<Uint8Array, Multipart.MultipartError>
  readonly contentEffect: Effect.Effect<Uint8Array, Multipart.MultipartError>
  readonly file: MP.FileStream

  constructor(file: MP.FileStream) {
    super()
    this.file = file
    this.key = file.info.name
    this.name = file.filename ?? file.info.name
    this.contentType = file.info.contentType
    this.content = NodeStream.fromReadable({
      evaluate: () => file,
      onError: (cause) => Multipart.MultipartError.fromReason("InternalError", cause)
    })
    this.contentEffect = NodeStream.toUint8Array(() => file, {
      onError: (cause) => Multipart.MultipartError.fromReason("InternalError", cause)
    })
  }

  toJSON(): unknown {
    return {
      _id: "@effect/platform/Multipart/Part",
      _tag: "File",
      key: this.key,
      name: this.name,
      contentType: this.contentType
    }
  }
}

function convertError(cause: MultipartParser.MultipartError): Multipart.MultipartError {
  switch (cause._tag) {
    case "ReachedLimit": {
      switch (cause.limit) {
        case "MaxParts": {
          return Multipart.MultipartError.fromReason("TooManyParts", cause)
        }
        case "MaxFieldSize": {
          return Multipart.MultipartError.fromReason("FieldTooLarge", cause)
        }
        case "MaxPartSize": {
          return Multipart.MultipartError.fromReason("FileTooLarge", cause)
        }
        case "MaxTotalSize": {
          return Multipart.MultipartError.fromReason("BodyTooLarge", cause)
        }
      }
    }
    default: {
      return Multipart.MultipartError.fromReason("Parse", cause)
    }
  }
}
