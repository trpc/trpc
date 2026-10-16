import { describe, it } from "@effect/vitest"
import { ByteSize, Effect, ErrorReporter, FileSystem, identity, Path, Schema, Sink, Stream, Unify } from "effect"
import { HttpClientRequest, HttpIncomingMessage, HttpServerRequest, Multipart, MultipartParser } from "effect/http"
import * as HttpServerRespondable from "effect/http/HttpServerRespondable"
import { deepStrictEqual, notStrictEqual, strictEqual } from "node:assert"

describe("Multipart", () => {
  it.effect("schemaJson applies a JSON reviver", () =>
    Effect.gen(function*() {
      const decoded = yield* Multipart.schemaJson(Schema.Struct({ value: Schema.String }), {
        reviver: (key, value) => key === "value" ? "revived" : value
      })({ json: "{\"value\":\"original\"}" }, "json")

      deepStrictEqual(decoded, { value: "revived" })
    }))

  it.effect("parses fields and streams file content as stream parts", () =>
    Effect.gen(function*() {
      const data = new globalThis.FormData()
      data.append("foo", "bar")
      data.append("test", "ing")
      data.append("file", new globalThis.File(["A".repeat(1024 * 1024)], "foo.txt", { type: "text/plain" }))
      const response = new Response(data)
      const streamed: Array<Multipart.Part> = []

      const parts = yield* Stream.fromReadableStream({
        evaluate: () => response.body!,
        onError: identity
      }).pipe(
        Stream.pipeThroughChannel(Multipart.makeChannel(Object.fromEntries(response.headers))),
        Stream.mapEffect((part) => {
          streamed.push(part)
          return Unify.unify(
            part._tag === "File" ?
              Effect.zip(
                Effect.succeed(part.name),
                Stream.mkString(Stream.decodeText(part.content))
              ) :
              Effect.succeed([part.key, part.value] as const)
          )
        }),
        Stream.runCollect
      )

      deepStrictEqual(parts, [
        ["foo", "bar"],
        ["test", "ing"],
        ["foo.txt", "A".repeat(1024 * 1024)]
      ])
      deepStrictEqual(
        streamed.map((part) => [Multipart.isPart(part), Multipart.isStreamPart(part)]),
        [[true, true], [true, true], [true, true]]
      )
    }))

  it.effect("collects file content across pulls and a split trailing boundary", () =>
    Effect.gen(function*() {
      const boundary = "----testboundary"
      const encoder = new TextEncoder()
      const boundarySplit = 8
      const chunks = [
        encoder.encode(
          `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="file"; filename="file.txt"\r\n` +
            `Content-Type: text/plain\r\n\r\n` +
            "abc"
        ),
        encoder.encode(`def\r\n--${boundary.slice(0, boundarySplit)}`),
        encoder.encode(`${boundary.slice(boundarySplit)}--\r\n`)
      ]

      const contents = yield* Stream.fromArray(chunks).pipe(
        Stream.rechunk(1),
        Stream.pipeThroughChannel(
          Multipart.makeChannel({ "content-type": `multipart/form-data; boundary=${boundary}` })
        ),
        Stream.mapEffect((part) => part._tag === "File" ? part.contentEffect : Effect.die("expected file")),
        Stream.runCollect
      )

      deepStrictEqual(contents, [encoder.encode("abcdef")])
    }))

  it.live("emits a field buffered while reading a file without pulling more input", () =>
    Effect.gen(function*() {
      const boundary = "----testboundary"
      const encoder = new TextEncoder()
      const body = encoder.encode(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="file"; filename="file.txt"\r\n` +
          `Content-Type: text/plain\r\n\r\n` +
          "file contents\r\n" +
          `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="description"\r\n\r\n` +
          "test file\r\n" +
          `--${boundary}--\r\n`
      )
      const chunks = [body.subarray(0, 64), body.subarray(64, 128), body.subarray(128)]

      const parts = yield* Stream.fromArray(chunks).pipe(
        Stream.rechunk(1),
        Stream.concat(Stream.never),
        Stream.pipeThroughChannel(
          Multipart.makeChannel({ "content-type": `multipart/form-data; boundary=${boundary}` })
        ),
        Stream.mapEffect((part) =>
          part._tag === "File"
            ? part.contentEffect.pipe(Effect.map((content) => [part.key, new TextDecoder().decode(content)] as const))
            : Effect.succeed([part.key, part.value] as const)
        ),
        Stream.take(2),
        Stream.runCollect,
        Effect.timeout("2 seconds")
      )

      deepStrictEqual(parts, [
        ["file", "file contents"],
        ["description", "test file"]
      ])
    }))

  it.effect("parses non-Latin-1 filenames", () =>
    Effect.gen(function*() {
      const data = new globalThis.FormData()
      data.append("file", new globalThis.File(["content"], "日本語.txt", { type: "text/plain" }))
      const response = new Response(data)

      const parts = yield* Stream.fromReadableStream({
        evaluate: () => response.body!,
        onError: identity
      }).pipe(
        Stream.pipeThroughChannel(Multipart.makeChannel(Object.fromEntries(response.headers))),
        Stream.mapEffect((part) =>
          Unify.unify(
            part._tag === "File"
              ? Stream.runDrain(part.content).pipe(Effect.as([part.key, part.name] as const))
              : Effect.succeed([part.key, part.value] as const)
          )
        ),
        Stream.runCollect
      )

      deepStrictEqual(parts, [["file", "日本語.txt"]])
    }))

  it.effect("fails when a limit is exceeded even if the whole body arrives in one chunk", () =>
    Effect.gen(function*() {
      const boundary = "----testboundary"
      const part = (name: string) =>
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${name}"; filename="${name}.txt"\r\n` +
        `Content-Type: text/plain\r\n\r\n${name}\r\n`
      const body = part("a") + part("b") + part("c") + `--${boundary}--\r\n`

      const error = yield* Stream.make(new TextEncoder().encode(body)).pipe(
        Stream.pipeThroughChannel(
          Multipart.makeChannel({ "content-type": `multipart/form-data; boundary=${boundary}` })
        ),
        Stream.runCollect,
        Effect.provideService(Multipart.MaxParts, 2),
        Effect.flip
      )

      strictEqual(error._tag, "MultipartError")
      strictEqual(error.reason._tag, "TooManyParts")
    }))

  it.effect("propagates FileTooLarge after a file exceeds the limit mid-stream", () =>
    Effect.gen(function*() {
      const boundary = "----testboundary"
      const encoder = new TextEncoder()
      let fileParts = 0
      const fileStart = `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="file.txt"\r\n` +
        `Content-Type: text/plain\r\n\r\n` +
        "a"
      const fileEnd = `\r\n--${boundary}--\r\n`

      const error = yield* Stream.make(
        encoder.encode(fileStart),
        encoder.encode("a".repeat(1024)),
        encoder.encode(fileEnd)
      ).pipe(
        Stream.pipeThroughChannel(
          Multipart.makeChannel({ "content-type": `multipart/form-data; boundary=${boundary}` })
        ),
        Stream.mapEffect((part) => {
          if (part._tag !== "File") {
            return Effect.void
          }
          fileParts++
          return Stream.runDrain(part.content)
        }),
        Stream.runDrain,
        Effect.provideService(Multipart.MaxFileSize, ByteSize.bytes(256)),
        Effect.flip
      )

      strictEqual(fileParts, 1)
      strictEqual(error._tag, "MultipartError")
      strictEqual(error.reason._tag, "FileTooLarge")
    }))

  it.effect("propagates BodyTooLarge after the total size limit is exceeded mid-file", () =>
    Effect.gen(function*() {
      const boundary = "----testboundary"
      const encoder = new TextEncoder()
      let fileParts = 0
      const fileStart = `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="file.txt"\r\n` +
        `Content-Type: text/plain\r\n\r\n` +
        "a"
      const fileEnd = `\r\n--${boundary}--\r\n`

      const error = yield* Stream.make(
        encoder.encode(fileStart),
        encoder.encode("a".repeat(1024)),
        encoder.encode(fileEnd)
      ).pipe(
        Stream.pipeThroughChannel(
          Multipart.makeChannel({ "content-type": `multipart/form-data; boundary=${boundary}` })
        ),
        Stream.mapEffect((part) => {
          if (part._tag !== "File") {
            return Effect.void
          }
          fileParts++
          return Stream.runDrain(part.content)
        }),
        Stream.runDrain,
        Effect.provideService(HttpIncomingMessage.MaxBodySize, ByteSize.bytes(256)),
        Effect.flip
      )

      strictEqual(fileParts, 1)
      strictEqual(error._tag, "MultipartError")
      strictEqual(error.reason._tag, "BodyTooLarge")
    }))

  const activeFileParts = (error: Multipart.MultipartError) =>
    Stream.make(
      new TextEncoder().encode(
        "--b\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a.txt\"\r\n\r\nhello"
      )
    ).pipe(
      Stream.concat(Stream.fail(error)),
      Stream.pipeThroughChannel(Multipart.makeChannel({ "content-type": "multipart/form-data; boundary=b" }))
    )

  it.live("propagates upstream failure while consuming an active file", () =>
    Effect.gen(function*() {
      const upstreamError = Multipart.MultipartError.fromReason("InternalError", new Error("body-read-failed"))
      let bytesRead = 0

      const error = yield* activeFileParts(upstreamError).pipe(
        Stream.runForEach((part) =>
          part._tag === "File"
            ? Stream.runForEach(part.content, (chunk) =>
              Effect.sync(() => {
                bytesRead += chunk.length
              })).pipe(Effect.flatMap(() => Effect.die("content should have failed")))
            : Effect.die("expected file")
        ),
        Effect.timeout("1 second"),
        Effect.flip
      )

      strictEqual(bytesRead, 5)
      strictEqual(error, upstreamError)
    }))

  it.live("preserves upstream failure when collecting an active file with contentEffect", () =>
    Effect.gen(function*() {
      const upstreamError = Multipart.MultipartError.fromReason("InternalError", new Error("body-read-failed"))

      const error = yield* activeFileParts(upstreamError).pipe(
        Stream.runForEach((part) =>
          part._tag === "File"
            ? Effect.flatMap(part.contentEffect, () => Effect.die("contentEffect should have failed"))
            : Effect.die("expected file")
        ),
        Effect.timeout("1 second"),
        Effect.flip
      )

      strictEqual(error, upstreamError)
    }))

  it.live("preserves the upstream error cause when persisting an active file", () =>
    Effect.gen(function*() {
      const upstreamError = Multipart.MultipartError.fromReason("InternalError", new Error("body-read-failed"))
      let bytesWritten = 0

      const error = yield* activeFileParts(upstreamError).pipe(
        Multipart.toPersisted,
        Effect.provideService(
          FileSystem.FileSystem,
          FileSystem.makeNoop({
            makeTempDirectoryScoped: () => Effect.succeed("/tmp/multipart-test"),
            sink: () =>
              Sink.forEach((chunk: Uint8Array) =>
                Effect.sync(() => {
                  bytesWritten += chunk.length
                })
              )
          })
        ),
        Effect.provide(Path.layer),
        Effect.scoped,
        Effect.timeout("1 second"),
        Effect.flip
      )

      strictEqual(bytesWritten, 5)
      strictEqual(error, upstreamError)
    }))

  it.effect("propagates Parse when the body ends mid-file", () =>
    Effect.gen(function*() {
      const boundary = "----testboundary"
      const encoder = new TextEncoder()
      let fileParts = 0
      const fileStart = `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="file.txt"\r\n` +
        `Content-Type: text/plain\r\n\r\n` +
        "a"

      const error = yield* Stream.make(
        encoder.encode(fileStart),
        encoder.encode("bbbb")
      ).pipe(
        Stream.pipeThroughChannel(
          Multipart.makeChannel({ "content-type": `multipart/form-data; boundary=${boundary}` })
        ),
        Stream.mapEffect((part) => {
          if (part._tag !== "File") {
            return Effect.void
          }
          fileParts++
          return Stream.runDrain(part.content)
        }),
        Stream.runDrain,
        Effect.flip
      )

      strictEqual(fileParts, 1)
      strictEqual(error._tag, "MultipartError")
      strictEqual(error.reason._tag, "Parse")
    }))

  it.each<{
    description: string
    options: {
      readonly maxParts?: number
      readonly maxFieldSize?: ByteSize.Input
      readonly maxPartSize?: ByteSize.Input
    }
    limit: "MaxParts" | "MaxFieldSize" | "MaxPartSize"
    expectedFields: Array<string>
  }>([
    {
      description: "maxParts",
      options: { maxParts: 2 },
      limit: "MaxParts",
      expectedFields: ["a", "b"]
    },
    {
      description: "maxFieldSize",
      options: { maxFieldSize: "1 B" },
      limit: "MaxFieldSize",
      expectedFields: []
    },
    {
      description: "maxPartSize",
      options: { maxPartSize: ByteSize.bytes(1) },
      limit: "MaxPartSize",
      expectedFields: []
    }
  ])("stops delivering fields when $description is exceeded", ({ expectedFields, limit, options }) => {
    const boundary = "----testboundary"
    const encoder = new TextEncoder()
    const fields: Array<string> = []
    const errors: Array<MultipartParser.MultipartError> = []
    const parser = MultipartParser.make({
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      ...options,
      onField(info) {
        fields.push(info.name)
      },
      onFile: () => () => {},
      onError(error) {
        errors.push(error)
      },
      onDone() {}
    })
    const part = (name: string) => `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\nvalue\r\n`

    parser.write(encoder.encode(part("a") + part("b") + part("c") + part("d") + `--${boundary}--\r\n`))
    parser.end()

    deepStrictEqual(errors, [{ _tag: "ReachedLimit", limit }])
    deepStrictEqual(fields, expectedFields)
  })

  it("handles the final boundary delimiter split between the trailing hyphens", () => {
    const boundary = "----testboundary"
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()
    const errors: Array<MultipartParser.MultipartError> = []
    const fields: Array<readonly [string, string]> = []
    let done = false
    const parser = MultipartParser.make({
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      maxTotalSize: Infinity,
      maxPartSize: Infinity,
      maxFieldSize: Infinity,
      onField(info, value) {
        fields.push([info.name, decoder.decode(value)])
      },
      onFile: () => () => {},
      onError(error) {
        errors.push(error)
      },
      onDone() {
        done = true
      }
    })
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="field"\r\n\r\nvalue`

    parser.write(encoder.encode(`${body}\r\n--${boundary}-`))
    parser.write(encoder.encode("-\r\n"))
    strictEqual(done, true)
    parser.end()

    deepStrictEqual(fields, [["field", "value"]])
    deepStrictEqual(errors, [])
  })

  it.effect("returns distinct persisted file paths as non-stream parts", () =>
    Effect.gen(function*() {
      const formData = new FormData()
      formData.append("first", new File(["one"], "same.txt"))
      formData.append("second", new File(["two"], "same.txt"))
      const request = HttpServerRequest.fromClientRequest(
        HttpClientRequest.bodyFormData(HttpClientRequest.post("https://example.com"), formData)
      )
      const writes: Array<string> = []
      const persisted = yield* Multipart.toPersisted(
        request.multipartStream,
        (path) => Effect.sync(() => writes.push(path))
      ).pipe(
        Effect.provideService(
          FileSystem.FileSystem,
          FileSystem.makeNoop({
            makeTempDirectoryScoped: () => Effect.succeed("/tmp/audit")
          })
        ),
        Effect.provide(Path.layer)
      )
      const first = (persisted.first as Array<Multipart.PersistedFile>)[0]
      const second = (persisted.second as Array<Multipart.PersistedFile>)[0]
      strictEqual(Multipart.isPersistedFile(first), true)
      strictEqual(Multipart.isPart(first), true)
      strictEqual(Multipart.isStreamPart(first), false)
      strictEqual(first.path, "/tmp/audit/same.txt")
      notStrictEqual(first.path, second.path)
      deepStrictEqual(writes, [first.path, second.path])
    }))

  it.effect("responds based on the reason and is ignored by the ErrorReporter", () =>
    Effect.gen(function*() {
      const cases = [
        ["FileTooLarge", 413],
        ["FieldTooLarge", 413],
        ["BodyTooLarge", 413],
        ["TooManyParts", 413],
        ["InternalError", 500],
        ["Parse", 400]
      ] as const

      for (const [reason, status] of cases) {
        const error = Multipart.MultipartError.fromReason(reason)
        const response = yield* HttpServerRespondable.toResponse(error)

        strictEqual(response.status, status)
        strictEqual(ErrorReporter.isIgnored(error), true)
      }
    }))

  describe("FileSchema", () => {
    it("toJsonSchema", () => {
      const document = Schema.toJsonSchemaDocument(Multipart.PersistedFileSchema)
      deepStrictEqual(document, {
        dialect: "draft-2020-12",
        schema: {
          "type": "object",
          "properties": {
            "key": {
              "type": "string"
            },
            "name": {
              "type": "string"
            },
            "contentType": {
              "type": "string",
              "contentEncoding": "binary"
            },
            "path": {
              "type": "string"
            }
          },
          "required": ["key", "name", "contentType", "path"],
          "additionalProperties": true
        },
        definitions: {}
      })
    })
  })

  it("identifies multipart errors", () => {
    strictEqual(Multipart.isMultipartError(Multipart.MultipartError.fromReason("Parse")), true)
    strictEqual(Multipart.isMultipartError({ _tag: "MultipartError" }), false)
    strictEqual(Multipart.isMultipartError(null), false)
  })
})
