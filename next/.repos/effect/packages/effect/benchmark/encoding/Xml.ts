import { Effect, Stream } from "effect"
import { Xml } from "effect/encoding"
import { Bench } from "tinybench"

const bench = new Bench()

// A feed-style document: text, references and a few attributes per item
const feed = (items: number): string => {
  const parts = ["<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<rss version=\"2.0\">\n<channel>\n<title>Feed</title>\n"]
  for (let i = 0; i < items; i++) {
    parts.push(
      `<item id="${i}">\n  <title>Item ${i} &amp; friends</title>\n` +
        `  <link>https://example.com/items/${i}?a=1&amp;b=2</link>\n` +
        `  <guid isPermaLink="false">urn:uuid:${i}-0000-4000-8000-000000000000</guid>\n` +
        `  <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>\n` +
        `  <description>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor ` +
        `incididunt ut labore et dolore magna aliqua &lt;b&gt;bold&lt;/b&gt; quis nostrud exercitation.</description>\n` +
        `  <category>news</category><category>effect</category>\n</item>\n`
    )
  }
  parts.push("</channel>\n</rss>\n")
  return parts.join("")
}

// An attribute-heavy document with little text
const table = (rows: number): string => {
  const parts = ["<table>"]
  for (let i = 0; i < rows; i++) {
    parts.push(
      `<row id="${i}" name="row-${i}" kind="data" created="2024-01-01T00:00:00Z" score="${i % 100}" ` +
        `flag="true" href="https://example.com/${i}"/>`
    )
  }
  parts.push("</table>")
  return parts.join("")
}

const split = (text: string, size: number): Array<string> => {
  const chunks: Array<string> = []
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size))
  return chunks
}

const splitBytes = (bytes: Uint8Array, size: number): Array<Uint8Array> => {
  const chunks: Array<Uint8Array> = []
  for (let i = 0; i < bytes.length; i += size) chunks.push(bytes.subarray(i, i + size))
  return chunks
}

const decodeString = (chunks: Array<string>) =>
  Effect.runPromise(
    Stream.fromIterable(chunks).pipe(Stream.pipeThroughChannel(Xml.decodeString()), Stream.runCount)
  )

const decode = (chunks: Array<Uint8Array>) =>
  Effect.runPromise(Stream.fromIterable(chunks).pipe(Stream.pipeThroughChannel(Xml.decode()), Stream.runCount))

const elements = (chunks: Array<string>, path: Array<string>) =>
  Effect.runPromise(
    Stream.fromIterable(chunks).pipe(
      Stream.pipeThroughChannel(Xml.decodeString()),
      Stream.pipeThroughChannel(Xml.elements(path)),
      Stream.runCount
    )
  )

const events = (text: string) =>
  Effect.runPromise(
    Stream.make(text).pipe(Stream.pipeThroughChannel(Xml.decodeString()), Stream.runCollect)
  )

const encodeString = (events: ReadonlyArray<Xml.Event>) =>
  Effect.runPromise(
    Stream.fromIterable(events).pipe(Stream.pipeThroughChannel(Xml.encodeString()), Stream.runCount)
  )

const encode = (events: ReadonlyArray<Xml.Event>) =>
  Effect.runPromise(Stream.fromIterable(events).pipe(Stream.pipeThroughChannel(Xml.encode()), Stream.runCount))

const encoder = new TextEncoder()
const documents = [
  { name: "feed", text: feed(8000), path: ["rss", "channel", "item"] },
  { name: "table", text: table(40000), path: ["table", "row"] }
]

for (const { name, path, text } of documents) {
  const bytes = encoder.encode(text)
  const decoded = await events(text)
  bench
    .add(`${name} decodeString (1 chunk, ${(text.length / 1024 / 1024).toFixed(1)} MiB)`, async function() {
      await decodeString([text])
    })
    .add(`${name} decodeString (64 KiB chunks)`, async function() {
      await decodeString(split(text, 64 * 1024))
    })
    .add(`${name} decodeString (1 KiB chunks)`, async function() {
      await decodeString(split(text, 1024))
    })
    .add(`${name} decode (64 KiB chunks)`, async function() {
      await decode(splitBytes(bytes, 64 * 1024))
    })
    .add(`${name} elements (64 KiB chunks)`, async function() {
      await elements(split(text, 64 * 1024), path)
    })
    .add(`${name} encodeString`, async function() {
      await encodeString(decoded)
    })
    .add(`${name} encode`, async function() {
      await encode(decoded)
    })
}

await bench.run()

console.table(bench.table())
