import * as NodeStream from "@effect/platform-node-shared/NodeStream"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import * as Array from "effect/Array"
import * as ByteSize from "effect/ByteSize"
import * as Channel from "effect/Channel"
import * as Console from "effect/Console"
import * as Stream from "effect/Stream"
import { Duplex, Readable, Transform } from "node:stream"
import * as Zlib from "node:zlib"

describe("Stream", () => {
  const destroyedOnRead = () =>
    new Readable({
      read() {
        this.destroy()
      }
    })
  const errorCode = (error: unknown) => (error as NodeJS.ErrnoException).code

  for (const [chunkSize, expectedSize] of [[undefined, 4096], [2, 2], [Infinity, 10_000]] as const) {
    it.effect(`fromReadable batches synchronous draining (${chunkSize ?? "default 4096"})`, () =>
      Effect.gen(function*() {
        let reads = 0
        const readable = new Readable({
          objectMode: true,
          highWaterMark: 1,
          read() {
            reads++
            this.push(reads > 10_000 ? null : reads)
          }
        })
        const chunks = yield* NodeStream.fromReadable<number>({
          evaluate: () => readable,
          ...(chunkSize === undefined ? {} : { chunkSize })
        }).pipe(Stream.chunks, Stream.take(1), Stream.runCollect)

        assert.strictEqual(chunks.length, 1)
        assert.strictEqual(chunks[0].length, expectedSize)
        assert.deepEqual(chunks, [Array.range(1, expectedSize)])
        // Node may prefetch one object into its own buffer.
        assert.isAtMost(reads, expectedSize + 1)
      }))
  }

  for (
    const [options, expected] of [
      [{ chunkSize: 2, readSize: 3 }, [["abc", "def"], ["ghi", "jk"]]],
      [{ chunkSize: 2 }, [["abcdefghijk"]]],
      [{ readSize: 3 }, [["abc", "def", "ghi", "jk"]]],
      [{ chunkSize: Infinity, readSize: 3 }, [["abc", "def", "ghi", "jk"]]]
    ] as const
  ) {
    it.effect(`fromReadable separates read size from batching (chunkSize=${"chunkSize" in options ? options.chunkSize : "default"}, readSize=${"readSize" in options ? options.readSize : "default"})`, () =>
      Effect.gen(function*() {
        const readable = new Readable({ read() {} })
        readable.push(Buffer.from("abcdefghijk"))
        readable.push(null)
        const chunks = yield* NodeStream.fromReadable({
          evaluate: () => readable,
          ...options
        }).pipe(Stream.chunks, Stream.runCollect)

        assert.deepEqual(
          chunks.map((batch) => batch.map((bytes) => Buffer.from(bytes).toString())),
          expected.map((batch) => [...batch])
        )
      }))
  }

  it.effect("fromReadable fails on premature close", () =>
    Effect.gen(function*() {
      const code = yield* NodeStream.fromReadable({ evaluate: destroyedOnRead, onError: errorCode }).pipe(
        Stream.runDrain,
        Effect.flip
      )
      assert.strictEqual(code, "ERR_STREAM_PREMATURE_CLOSE")
    }))

  it.effect("fromReadable fails on an already destroyed readable", () =>
    Effect.gen(function*() {
      const readable = new Readable({ read() {} })
      const closed = new Promise((resolve) => readable.once("close", resolve))
      readable.destroy()
      yield* Effect.promise(() => closed)
      const code = yield* NodeStream.fromReadable({ evaluate: () => readable, onError: errorCode }).pipe(
        Stream.runDrain,
        Effect.flip
      )
      assert.strictEqual(code, "ERR_STREAM_PREMATURE_CLOSE")
    }))

  it.effect("fromReadable removes its listeners when destroyed without a close event", () =>
    Effect.gen(function*() {
      const readable = new Readable({ emitClose: false, read() {} })
      readable.push("a")
      yield* NodeStream.fromReadable({ evaluate: () => readable }).pipe(Stream.take(1), Stream.runDrain)
      yield* Effect.promise(() => new Promise((resolve) => setImmediate(resolve)))
      assert.strictEqual(readable.listenerCount("error"), 0)
      assert.strictEqual(readable.listenerCount("close"), 0)
    }))

  it.effect("toString fails on premature close", () =>
    Effect.gen(function*() {
      const code = yield* NodeStream.toString(destroyedOnRead, { onError: errorCode }).pipe(Effect.flip)
      assert.strictEqual(code, "ERR_STREAM_PREMATURE_CLOSE")
    }))

  it.effect("toArrayBuffer fails on premature close", () =>
    Effect.gen(function*() {
      const code = yield* NodeStream.toArrayBuffer(destroyedOnRead, { onError: errorCode }).pipe(Effect.flip)
      assert.strictEqual(code, "ERR_STREAM_PREMATURE_CLOSE")
    }))

  it.effect("toString keeps the maxBytes failure when destroy fails", () =>
    Effect.gen(function*() {
      const readable = new Readable({
        read() {
          this.push("too large")
        },
        destroy(_error, callback) {
          setImmediate(() => callback(new Error("destroy failed")))
        }
      })
      const closed = new Promise((resolve) => readable.once("close", resolve))
      const error = yield* NodeStream.toString(() => readable, {
        maxBytes: 1,
        onError: (error) => (error as Error).message
      }).pipe(Effect.flip)
      assert.strictEqual(error, "maxBytes exceeded")
      yield* Effect.promise(() => closed)
    }))

  it.effect("handles a late upload error after overflow without leaking listeners", () =>
    Effect.gen(function*() {
      const readable = new Readable({ read() {} })
      yield* Effect.addFinalizer(() => Effect.sync(() => readable.destroy()))
      readable.push(Buffer.from("too large"))
      const error = yield* NodeStream.toString(() => readable, {
        maxBytes: 1,
        destroyOnOverflow: false,
        onError: (error) => error
      }).pipe(Effect.flip)

      assert.instanceOf(error, NodeStream.MaxBytesError)
      assert.isFalse(readable.destroyed)
      readable.push(Buffer.from("remaining upload"))
      const closed = new Promise<void>((resolve) => readable.once("close", resolve))
      readable.destroy(new Error("late upload failure"))
      yield* Effect.promise(() => closed)
      for (const event of ["data", "end", "error", "close", "finish"]) {
        assert.strictEqual(readable.listenerCount(event), 0)
      }
    }))

  it.effect("should read a stream", () =>
    Effect.gen(function*() {
      const stream = NodeStream.fromReadable<"error", string>({
        evaluate: () => Readable.from(["a", "b", "c"]),
        onError: () => "error"
      })
      const items = yield* Stream.runCollect(stream)
      assert.deepEqual(items, ["a", "b", "c"])
    }))

  it.effect("fromDuplex", () =>
    Effect.gen(function*() {
      const result = yield* Stream.fromArray(["a", "b", "c"]).pipe(
        Stream.pipeThroughChannelOrFail(NodeStream.fromDuplex({
          evaluate: () =>
            new Transform({
              transform(chunk, _encoding, callback) {
                callback(null, chunk.toString().toUpperCase())
              }
            }),
          onError: () => "error" as const
        })),
        Stream.decodeText(),
        Stream.mkString
      )

      assert.strictEqual(result, "ABC")
    }))

  for (const adapter of ["fromDuplex", "pipeThroughDuplex"] as const) {
    it.effect(`${adapter} bounds byte drains and completes in order`, () =>
      Effect.gen(function*() {
        const input = Buffer.from("abcdefghijk")
        let offset = 0
        let reads = 0
        const options = {
          evaluate: () =>
            new Duplex({
              highWaterMark: 1,
              read() {
                reads++
                if (offset === input.length) {
                  this.push(null)
                } else {
                  const next = Math.min(offset + 3, input.length)
                  this.push(input.subarray(offset, next))
                  offset = next
                }
              },
              write(_chunk, _encoding, callback) {
                callback()
              }
            }),
          chunkSize: 2,
          readSize: 3
        }
        const stream = adapter === "fromDuplex"
          ? Stream.empty.pipe(Stream.pipeThroughChannelOrFail(NodeStream.fromDuplex(options)))
          : Stream.empty.pipe(NodeStream.pipeThroughDuplex(options))
        let batches = 0
        const chunks = yield* stream.pipe(
          Stream.chunks,
          Stream.tap((batch) =>
            Effect.sync(() => {
              assert.isAtMost(batch.length, 2)
              if (batches++ === 0) {
                assert.deepEqual(batch.map((bytes) => Buffer.from(bytes).toString()), ["abc", "def"])
                // Allow one Node-prefetched buffer, but not the entire source.
                assert.isAtMost(reads, 3)
              }
            })
          ),
          Stream.runCollect
        )
        assert.isAbove(batches, 1)
        const bytes = chunks.flat()
        assert.deepEqual(bytes.map((chunk) => chunk.length), [3, 3, 3, 2])
        assert.strictEqual(Buffer.concat(bytes).toString(), "abcdefghijk")
      }))
  }

  it.effect("fromDuplex failure", () =>
    Effect.gen(function*() {
      const result = yield* Stream.fromArray(["a", "b", "c"]).pipe(
        Stream.pipeThroughChannelOrFail(NodeStream.fromDuplex({
          evaluate: () =>
            new Transform({
              transform(_chunk, _encoding, callback) {
                callback(new Error())
              }
            }),
          onError: () => "error" as const
        })),
        Stream.runDrain,
        Effect.flip
      )

      assert.strictEqual(result, "error")
    }))

  it.effect("pipeThroughDuplex", () =>
    Effect.gen(function*() {
      const result = yield* Stream.fromArray(["a", "b", "c"]).pipe(
        NodeStream.pipeThroughDuplex({
          evaluate: () =>
            new Transform({
              transform(chunk, _encoding, callback) {
                callback(null, chunk.toString().toUpperCase())
              }
            }),
          onError: () => "error" as const
        }),
        Stream.decodeText(),
        Stream.mkString
      )

      assert.strictEqual(result, "ABC")
    }))

  it.effect("pipeThroughDuplex propagates upstream failure", () =>
    Effect.gen(function*() {
      const result = yield* Stream.fail("upstream error").pipe(
        NodeStream.pipeThroughDuplex({
          evaluate: () =>
            new Duplex({
              read() {},
              write(_chunk, _encoding, callback) {
                callback()
              }
            })
        }),
        Stream.runDrain,
        Effect.flip
      )

      assert.strictEqual(result, "upstream error")
    }))

  it.effect("pipeThroughDuplex write error", () =>
    Effect.gen(function*() {
      const result = yield* Stream.fromArray(["a", "b", "c"]).pipe(
        NodeStream.pipeThroughDuplex({
          evaluate: () =>
            new Duplex({
              read() {},
              write(_chunk, _encoding, callback) {
                callback(new Error())
              }
            }),
          onError: () => "error" as const
        }),
        Stream.runDrain,
        Effect.flip
      )
      assert.strictEqual(result, "error")
    }))

  it.effect("pipeThroughSimple", () =>
    Effect.gen(function*() {
      const result = yield* Stream.fromArray(["a", Buffer.from("b"), "c"]).pipe(
        NodeStream.pipeThroughSimple(
          () =>
            new Transform({
              transform(chunk, _encoding, callback) {
                callback(null, chunk.toString().toUpperCase())
              }
            })
        ),
        Stream.decodeText(),
        Stream.mkString
      )

      assert.strictEqual(result, "ABC")
    }))

  it.effect("fromDuplex should work with node:zlib", () =>
    Effect.gen(function*() {
      const text = "abcdefg1234567890"
      const encoder = new TextEncoder()
      const input = encoder.encode(text)
      const stream = NodeStream.fromReadable<Uint8Array, "error">({
        evaluate: () => Readable.from([input]),
        onError: () => "error"
      })
      const deflate = NodeStream.fromDuplex({
        evaluate: () => Zlib.createGzip(),
        onError: () => "error" as const
      })
      const inflate = NodeStream.fromDuplex<never, Uint8Array, Uint8Array, "error">({
        evaluate: () => Zlib.createUnzip(),
        onError: () => "error" as const
      })
      const channel = Channel.pipeToOrFail(deflate, inflate)
      const result = yield* stream.pipe(
        Stream.pipeThroughChannelOrFail(channel),
        Stream.decodeText(),
        Stream.mkString
      )
      assert.strictEqual(result, text)
    }))

  it.effect("toReadable roundtrip", () =>
    Effect.gen(function*() {
      const stream = Stream.range(0, 10000).pipe(
        Stream.map((n) => String(n))
      )
      const readable = yield* NodeStream.toReadable(stream)
      const outStream = NodeStream.fromReadable({
        evaluate: () => readable,
        onError: () => "error" as const
      })
      const items = yield* outStream.pipe(
        Stream.decodeText(),
        Stream.runCollect
      )
      assert.strictEqual(items.join(""), Array.range(0, 10000).join(""))
    }))

  it.effect("toReadable with error", () =>
    Effect.gen(function*() {
      const stream = Stream.fail("error")
      const readable = yield* NodeStream.toReadable(stream)
      const outStream = NodeStream.fromReadable({
        evaluate: () => readable
      })
      const error = yield* outStream.pipe(
        Stream.runCollect,
        Effect.tapError((_) => Console.log(_)),
        Effect.flip
      )
      assert.deepEqual(error.cause, "error")
    }))

  it.effect("toString registers one error listener", () =>
    Effect.gen(function*() {
      const stream = new Readable({
        read() {}
      })
      yield* NodeStream.toString(() => stream).pipe(Effect.forkChild)
      yield* Effect.yieldNow
      assert.strictEqual(stream.listenerCount("error"), 1)
    }))

  it.effect("collects strings and array buffers with an Infinity maxBytes limit", () =>
    Effect.gen(function*() {
      const chunks = [Buffer.from("hello "), Buffer.from("world")]
      const text = yield* NodeStream.toString(() => Readable.from(chunks), { maxBytes: Infinity })
      const buffer = yield* NodeStream.toArrayBuffer(() => Readable.from(chunks), { maxBytes: Infinity })

      assert.strictEqual(text, "hello world")
      assert.deepStrictEqual(new Uint8Array(buffer), new TextEncoder().encode("hello world"))
    }))

  it.effect("toString enforces a zero maxBytes limit", () =>
    Effect.gen(function*() {
      let emitted = false
      const stream = new Readable({
        read() {
          if (emitted) return
          emitted = true
          this.push("a")
        }
      })
      const error = yield* NodeStream.toString(() => stream, {
        maxBytes: "0 B",
        onError: () => "maxBytes exceeded" as const
      }).pipe(Effect.flip)

      assert.strictEqual(error, "maxBytes exceeded")
      assert.isTrue(stream.destroyed)
    }))

  it.effect("toString limits the bytes read before decoding", () =>
    Effect.gen(function*() {
      const latin1 = yield* NodeStream.toString(() => Readable.from([Buffer.from([0xe9])]), {
        encoding: "latin1",
        maxBytes: 1
      })
      const utf16le = yield* NodeStream.toString(() => Readable.from([Buffer.from("abcd", "utf16le")]), {
        encoding: "utf16le",
        maxBytes: 7,
        onError: (error) => error
      }).pipe(Effect.flip)

      assert.strictEqual(latin1, "é")
      assert.instanceOf(utf16le, NodeStream.MaxBytesError)
    }))

  it.effect("toString decodes characters split across chunks", () =>
    Effect.gen(function*() {
      const chunks = [Buffer.from([0xe2, 0x82]), Buffer.from([0xac, 0xe2])]
      const text = yield* NodeStream.toString(() => Readable.from(chunks), { maxBytes: 4 })

      assert.strictEqual(text, "€\ufffd")
    }))

  it.effect("toString limits the bytes read by a stream that already decodes", () =>
    Effect.gen(function*() {
      const stream = new Readable({
        read() {
          this.push(Buffer.from([0xe9]))
          this.push(null)
        }
      })
      stream.setEncoding("utf8")
      const text = yield* NodeStream.toString(() => stream, { encoding: "latin1", maxBytes: 1 })

      assert.strictEqual(text, "é")
    }))

  it.effect("toString limits object-mode strings by their UTF-8 length", () =>
    Effect.gen(function*() {
      const error = yield* NodeStream.toString(() => Readable.from(["a", "b", "c", "d"]), {
        encoding: "hex",
        maxBytes: 3,
        onError: (error) => error
      }).pipe(Effect.flip)

      assert.instanceOf(error, NodeStream.MaxBytesError)
    }))

  it.effect("toArrayBuffer enforces a zero maxBytes limit", () =>
    Effect.gen(function*() {
      let emitted = false
      const stream = new Readable({
        read() {
          if (emitted) return
          emitted = true
          this.push(Buffer.from("a"))
        }
      })
      const error = yield* NodeStream.toArrayBuffer(() => stream, {
        maxBytes: ByteSize.zero,
        onError: () => "maxBytes exceeded" as const
      }).pipe(Effect.flip)

      assert.strictEqual(error, "maxBytes exceeded")
      assert.isTrue(stream.destroyed)
    }))
})
