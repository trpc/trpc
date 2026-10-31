import * as NodeServices from "@effect/platform-node/NodeServices"
import { assert, describe, it } from "@effect/vitest"
import { type Cause, Effect, Exit, FileSystem, Path, Queue, Stream } from "effect"
import * as Tar from "effect/encoding/Tar"
import { gunzipSync } from "node:zlib"

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

// Fixtures were written by GNU tar 1.35; see fixtures/tar/README.md
const fixture = Effect.fnUntraced(function*(name: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const file = yield* path.fromFileUrl(new URL(`../fixtures/tar/${name}.tar.gz`, import.meta.url))
  return gunzipSync(yield* fs.readFile(file))
}, Effect.provide(NodeServices.layer))

const text = (bytes: Uint8Array) => textDecoder.decode(bytes)

const encode = <E>(entries: ReadonlyArray<Tar.Entry<E>>) =>
  Stream.fromIterable(entries).pipe(
    Stream.pipeThroughChannel(Tar.encode()),
    Stream.mkUint8Array
  )

const entries = (bytes: Uint8Array, chunkSize: number) => {
  const chunks: Array<Uint8Array> = []
  for (let i = 0; i < bytes.length; i += chunkSize) chunks.push(bytes.subarray(i, i + chunkSize))
  return Stream.fromIterable(chunks, { chunkSize: 1 }).pipe(Stream.pipeThroughChannel(Tar.decode()))
}

const decode = (bytes: Uint8Array, chunkSize = 4096) =>
  entries(bytes, chunkSize).pipe(
    Stream.mapEffect((entry) =>
      Effect.map(Stream.mkUint8Array(entry.body), (body) => ({ header: entry.header, body }))
    ),
    Stream.runCollect
  )

const failure = <A>(effect: Effect.Effect<A, unknown>) =>
  Effect.map(Effect.flip(effect), (error) => Tar.isTarError(error) ? error.kind : error)

describe("Tar", () => {
  describe("encode", () => {
    it.effect("round trips entries", () =>
      Effect.gen(function*() {
        const input: Array<Tar.Entry> = [
          Tar.directory("dir"),
          Tar.file("dir/a.txt", "hello\n"),
          Tar.fileStream("dir/b.bin", 3, Stream.make(new Uint8Array([0, 1]), new Uint8Array([255]))),
          Tar.symlink("dir/link", "a.txt", { uid: 1000, uname: "user", mtime: new Date("2024-01-02T03:04:05Z") }),
          Tar.hardlink("dir/hard", "dir/a.txt")
        ]
        const output = yield* decode(yield* encode(input))
        assert.deepStrictEqual(output.map((entry) => entry.header), input.map((entry) => entry.header))
        assert.deepStrictEqual(output.map((entry) => Array.from(entry.body)), [
          [],
          Array.from(textEncoder.encode("hello\n")),
          [0, 1, 255],
          [],
          []
        ])
      }))

    it.effect("round trips headers that do not fit USTAR fields", () =>
      Effect.gen(function*() {
        const input = [
          Tar.file(`${"a".repeat(120)}/${"b".repeat(90)}.txt`, "x"),
          Tar.file(`${"c".repeat(300)}.txt`, "y"),
          Tar.file("ids", "", { uid: 3_000_000, gname: "grüppe", pax: { "SCHILY.xattr.user.k": "v" } })
        ]
        const output = yield* decode(yield* encode(input))
        assert.deepStrictEqual(output.map((entry) => entry.header), input.map((entry) => entry.header))
        assert.deepStrictEqual(output.map((entry) => text(entry.body)), ["x", "y", ""])
      }))

    it.effect("fails when a body does not match its declared size", () =>
      Effect.gen(function*() {
        const short = Tar.fileStream("f", 5, Stream.make(textEncoder.encode("abc")))
        assert.strictEqual(yield* failure(encode([short])), "SizeMismatch")
        const long = Tar.fileStream("f", 2, Stream.make(textEncoder.encode("abc")))
        assert.strictEqual(yield* failure(encode([long])), "SizeMismatch")
      }))
  })

  describe("decode", () => {
    const tree = [
      ["tree/", "Directory", 3_000_000, ""],
      [`tree/${"a".repeat(80)}/`, "Directory", 3_000_000, ""],
      [`tree/${"a".repeat(80)}/${"b".repeat(60)}/`, "Directory", 3_000_000, ""],
      [`tree/${"a".repeat(80)}/${"b".repeat(60)}/${"c".repeat(90)}.txt`, "File", 3_000_000, "split\n"],
      [`tree/${"d".repeat(120)}/`, "Directory", 3_000_000, ""],
      [`tree/${"d".repeat(120)}/${"e".repeat(120)}/`, "Directory", 3_000_000, ""],
      [`tree/${"d".repeat(120)}/${"e".repeat(120)}/${"f".repeat(30)}.txt`, "File", 3_000_000, "long\n"],
      ["tree/dir/", "Directory", 3_000_000, ""],
      ["tree/dir/hello.txt", "File", 3_000_000, "hello\n"],
      ["tree/fifo", "Fifo", 3_000_000, ""],
      ["tree/hardlink.txt", "Hardlink", 3_000_000, "tree/dir/hello.txt"],
      ["tree/héllo-wörld-日本.txt", "File", 3_000_000, "unicode\n"],
      ["tree/longlink", "Symlink", 3_000_000, `${"x".repeat(150)}/target`],
      ["tree/shortlink", "Symlink", 3_000_000, "dir/hello.txt"]
    ]
    const fixtures = {
      gnu: tree,
      pax: tree,
      ustar: [
        ["small/", "Directory", 0, ""],
        [`small/${"a".repeat(80)}/`, "Directory", 0, ""],
        [`small/${"a".repeat(80)}/${"b".repeat(60)}/`, "Directory", 0, ""],
        [`small/${"a".repeat(80)}/${"b".repeat(60)}/${"c".repeat(90)}.txt`, "File", 0, "split\n"],
        ["small/dir/", "Directory", 0, ""],
        ["small/dir/hello.txt", "File", 0, "hello\n"],
        ["small/dir/link", "Symlink", 0, "hello.txt"]
      ],
      v7: [
        ["small/dir/", "Directory", 0, ""],
        ["small/dir/hello.txt", "File", 0, "hello\n"],
        ["small/dir/link", "Symlink", 0, "hello.txt"]
      ]
    }

    for (const [name, expected] of Object.entries(fixtures)) {
      it.effect(`reads GNU tar --format=${name} archives in any chunk size`, () =>
        Effect.gen(function*() {
          const bytes = yield* fixture(name)
          for (const chunkSize of [1, bytes.length]) {
            const output = yield* decode(bytes, chunkSize)
            assert.deepStrictEqual(
              output.map(({ body, header }) => [header.path, header.type, header.uid, header.linkTarget ?? text(body)]),
              expected
            )
          }
        }))
    }

    it.effect("emits body bytes before the rest of the archive arrives", () =>
      Effect.gen(function*() {
        const bytes = yield* encode([Tar.file("f", "z".repeat(2000))])
        const input = yield* Queue.unbounded<Uint8Array, Cause.Done>()
        yield* Queue.offer(input, bytes.subarray(0, 512 + 100))
        const pullEntry = yield* Stream.toPull(Stream.fromQueue(input).pipe(Stream.pipeThroughChannel(Tar.decode())))
        const [entry] = yield* pullEntry
        const pullBody = yield* Stream.toPull(entry.body)
        assert.strictEqual(text((yield* pullBody)[0]), "z".repeat(100))

        yield* Queue.offer(input, bytes.subarray(512 + 100))
        yield* Queue.end(input)
        let rest = 0
        while (true) {
          const exit = yield* Effect.exit(pullBody)
          if (Exit.isFailure(exit)) break
          for (const chunk of exit.value) rest += chunk.length
        }
        assert.strictEqual(rest, 1900)
      }))

    it.effect("skips unread bodies when moving to the next entry", () =>
      Effect.gen(function*() {
        const bytes = yield* encode([Tar.file("a", "a".repeat(1000)), Tar.file("b", "b".repeat(700))])
        for (const chunkSize of [1, bytes.length]) {
          const output = yield* entries(bytes, chunkSize).pipe(
            Stream.mapEffect((entry) => Effect.map(Stream.mkUint8Array(Stream.take(entry.body, 1)), (body) => body[0])),
            Stream.runCollect
          )
          assert.deepStrictEqual(output, ["a".charCodeAt(0), "b".charCodeAt(0)])
        }
      }))

    it.effect("fails body reads after the next entry is pulled", () =>
      Effect.gen(function*() {
        const bytes = yield* encode([Tar.file("a", "a"), Tar.file("b", "b")])
        const pull = yield* Stream.toPull(entries(bytes, 512))
        const [a] = yield* pull
        yield* pull
        assert.strictEqual(yield* failure(Stream.runDrain(a.body)), "BodyConsumed")
      }))

    it.effect("keeps leading byte order marks in PAX paths, link targets and keys", () =>
      Effect.gen(function*() {
        const name = "\uFEFF/etc/passwd"
        const pax = { "\uFEFFpath": "other" }
        const [{ header }] = yield* decode(yield* encode([Tar.symlink(name, name, { pax })]))
        assert.strictEqual(header.path, name)
        assert.strictEqual(header.linkTarget, name)
        assert.deepStrictEqual(header.pax, pax)
      }))

    it.effect("keeps a leading byte order mark in a USTAR name", () =>
      Effect.gen(function*() {
        // Writes the BOM bytes over the name and recomputes the checksum
        const ustar = yield* encode([Tar.file("___/etc/passwd", "")])
        ustar.set([0xef, 0xbb, 0xbf], 0)
        ustar.fill(0x20, 148, 156)
        const checksum = ustar.subarray(0, 512).reduce((sum, byte) => sum + byte, 0)
        ustar.set(textEncoder.encode(`${checksum.toString(8).padStart(6, "0")}\0 `), 148)
        assert.strictEqual((yield* decode(ustar))[0].header.path, "\uFEFF/etc/passwd")
      }))

    it.effect("fails on truncated or corrupt archives", () =>
      Effect.gen(function*() {
        const bytes = yield* encode([Tar.file("a", "a".repeat(600))])
        assert.strictEqual(yield* failure(decode(bytes.subarray(0, 512 + 300))), "Truncated")
        bytes[0] = "b".charCodeAt(0)
        assert.strictEqual(yield* failure(decode(bytes)), "InvalidHeader")
      }))

    it.effect("fails on GNU sparse files", () =>
      Effect.gen(function*() {
        assert.strictEqual(yield* failure(decode(yield* fixture("sparse-gnu"))), "Unsupported")
        assert.strictEqual(yield* failure(decode(yield* fixture("sparse-pax"))), "Unsupported")
      }))
  })
})
