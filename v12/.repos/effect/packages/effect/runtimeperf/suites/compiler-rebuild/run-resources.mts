import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import { dirname, join, resolve } from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const implementations = [
  "effect-interpreted",
  "valibot",
  "zod-jitless",
  "effect-jit",
  "effect-aot",
  "zod-compiled"
] as const

const cases = [
  "struct-decode",
  "struct-invalid",
  "struct-is",
  "array-decode",
  "union-decode",
  "transform-decode",
  "default-make"
] as const

const [outputArgument = "tmp/schema-compiler-resources.json", roundsArgument = "5", countsArgument = "100,500"] =
  process.argv.slice(2)
const rounds = Number(roundsArgument)
const counts = countsArgument.split(",").map(Number)
if (!Number.isSafeInteger(rounds) || rounds <= 0) throw new Error("rounds must be a positive integer")
if (counts.some((count) => !Number.isSafeInteger(count) || count <= 0)) {
  throw new Error("counts must be comma-separated positive integers")
}

const root = process.cwd()
const output = resolve(outputArgument)
const worker = fileURLToPath(new URL("./resources.mts", import.meta.url))
const require = createRequire(import.meta.url)
const packageVersion = (name: string) => {
  let directory = dirname(require.resolve(name))
  while (true) {
    try {
      const metadata = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"))
      if (metadata.name === name) return metadata.version as string
    } catch {
      // Continue at the parent directory.
    }
    const parent = dirname(directory)
    if (parent === directory) throw new Error(`package.json not found for ${name}`)
    directory = parent
  }
}

const results: Array<unknown> = []
for (let round = 0; round < rounds; round++) {
  const orderedImplementations = round % 2 === 0 ? implementations : implementations.toReversed()
  const orderedCounts = round % 2 === 0 ? counts : counts.toReversed()
  for (const count of orderedCounts) {
    for (const caseName of cases) {
      for (const implementation of orderedImplementations) {
        const sample = JSON.parse(execFileSync(
          process.execPath,
          ["--expose-gc", worker, "measure", root, implementation, caseName, String(count)],
          { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
        ))
        results.push({ round, ...sample })
      }
    }
    process.stderr.write(`resource round ${round + 1}/${rounds}, count ${count} complete\n`)
  }
}

mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, JSON.stringify({
  environment: {
    arch: process.arch,
    cpu: os.cpus()[0]?.model ?? "unknown",
    node: process.version,
    platform: process.platform,
    valibot: packageVersion("valibot"),
    v8: process.versions.v8,
    zod: packageVersion("zod")
  },
  measurement: {
    cases,
    counts,
    implementations,
    rounds
  },
  results
}, null, 2))
process.stdout.write(`${output}\n`)
