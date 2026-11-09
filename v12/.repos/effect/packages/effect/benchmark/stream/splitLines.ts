import { Effect, Stream } from "effect"
import { Bench } from "tinybench"

const bench = new Bench()

// ~100 short lines, all in one chunk
const singleChunk = Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n") + "\n"

// same content split into many small chunks (simulates streaming I/O)
const manyChunks: Array<string> = []
for (let i = 0; i < singleChunk.length; i += 8) {
  manyChunks.push(singleChunk.substring(i, i + 8))
}

// mixed line endings
const mixedEndings = "alpha\r\nbravo\rcharlie\ndelta\r\necho\rfoxtrot\n"
const mixedChunks: Array<string> = []
for (let i = 0; i < mixedEndings.length; i += 5) {
  mixedChunks.push(mixedEndings.substring(i, i + 5))
}

const run = (chunks: Array<string>) =>
  Effect.runPromise(
    Stream.fromIterable(chunks).pipe(
      Stream.splitLines,
      Stream.runCollect
    )
  )

bench
  .add("single chunk (100 lines)", async function() {
    await run([singleChunk])
  })
  .add("many small chunks (100 lines)", async function() {
    await run(manyChunks)
  })
  .add("mixed line endings (single chunk)", async function() {
    await run([mixedEndings])
  })
  .add("mixed line endings (small chunks)", async function() {
    await run(mixedChunks)
  })

await bench.run()

console.table(bench.table())
