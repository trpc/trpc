import { Effect, Stream } from "effect"
import * as Multipart from "effect/http/Multipart"
import * as MultipartParser from "effect/http/MultipartParser"
import { Bench } from "tinybench"

const bench = new Bench()

const boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
const headers = {
  "content-type": `multipart/form-data; boundary=${boundary}`
}
const encoder = new TextEncoder()

const filePayload = (fileSize: number, chunkSize: number): Array<Uint8Array> => {
  const head = encoder.encode(
    `--${boundary}\r\ncontent-disposition: form-data; name="file"; filename="file.bin"\r\ncontent-type: application/octet-stream\r\n\r\n`
  )
  const body = new Uint8Array(fileSize)
  for (let i = 0; i < fileSize; i++) {
    body[i] = i % 251
  }
  const tail = encoder.encode(`\r\n--${boundary}--\r\n`)
  const payload = new Uint8Array(head.length + body.length + tail.length)
  payload.set(head, 0)
  payload.set(body, head.length)
  payload.set(tail, head.length + body.length)
  const chunks: Array<Uint8Array> = []
  for (let i = 0; i < payload.length; i += chunkSize) {
    chunks.push(payload.subarray(i, i + chunkSize))
  }
  return chunks
}

const fieldsPayload = (fieldCount: number): Array<Uint8Array> => {
  let out = ""
  for (let i = 0; i < fieldCount; i++) {
    out += `--${boundary}\r\ncontent-disposition: form-data; name="field${i}"\r\n\r\nvalue of field number ${i}\r\n`
  }
  out += `--${boundary}--\r\n`
  return [encoder.encode(out)]
}

const file16MiB64KiB = filePayload(16 * 1024 * 1024, 64 * 1024)
const file16MiB4KiB = filePayload(16 * 1024 * 1024, 4 * 1024)
const file1MiB64KiB = filePayload(1024 * 1024, 64 * 1024)
const fields100 = fieldsPayload(100)

const runParser = (chunks: Array<Uint8Array>) => {
  const parser = MultipartParser.make({
    headers,
    onField() {},
    onFile() {
      return () => {}
    },
    onError(error) {
      throw new Error(`unexpected error: ${error._tag}`)
    },
    onDone() {}
  })
  for (let i = 0; i < chunks.length; i++) {
    parser.write(chunks[i])
  }
  parser.end()
}

const runChannelDrain = (chunks: Array<Uint8Array>) =>
  Effect.runPromise(
    Stream.fromArray(chunks).pipe(
      Stream.pipeThroughChannel(Multipart.makeChannel(headers)),
      Stream.mapEffect((part) => part._tag === "File" ? Stream.runDrain(part.content) : Effect.void),
      Stream.runDrain
    )
  )

// Stream.fromArray emits the chunks in one batch, so these are single-pull controls.
const runChannelCollect = (chunks: Array<Uint8Array>) =>
  Effect.runPromise(
    Stream.fromArray(chunks).pipe(
      Stream.pipeThroughChannel(Multipart.makeChannel(headers)),
      Stream.mapEffect((part) => part._tag === "File" ? part.contentEffect : Effect.void),
      Stream.runDrain
    )
  )

// rechunk(1) forces one upstream pull per chunk, simulating network reads and
// guarding against quadratic accumulation across pulls.
const runChannelCollectStreaming = (chunks: Array<Uint8Array>) =>
  Effect.runPromise(
    Stream.fromArray(chunks).pipe(
      Stream.rechunk(1),
      Stream.pipeThroughChannel(Multipart.makeChannel(headers)),
      Stream.mapEffect((part) => part._tag === "File" ? part.contentEffect : Effect.void),
      Stream.runDrain
    )
  )

bench
  .add("parser: 16MiB file / 64KiB chunks", function() {
    runParser(file16MiB64KiB)
  })
  .add("parser: 16MiB file / 4KiB chunks", function() {
    runParser(file16MiB4KiB)
  })
  .add("parser: 100 small fields", function() {
    runParser(fields100)
  })
  .add("channel drain: 16MiB file / 64KiB chunks", async function() {
    await runChannelDrain(file16MiB64KiB)
  })
  .add("channel collect: 16MiB file / 64KiB chunks", async function() {
    await runChannelCollect(file16MiB64KiB)
  })
  .add("channel collect: 1MiB file / 64KiB chunks", async function() {
    await runChannelCollect(file1MiB64KiB)
  })
  .add("channel collect streaming: 16MiB file / 64KiB chunks", async function() {
    await runChannelCollectStreaming(file16MiB64KiB)
  })

await bench.run()

console.table(bench.table())
