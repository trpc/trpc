import { readFileSync } from "node:fs"
import { resolve } from "node:path"

type Sample = {
  readonly aotBuild?: {
    readonly generateCpu: { readonly cpuMicros: number }
    readonly maxRssBytes: number
    readonly schemaCpu: { readonly cpuMicros: number }
    readonly sourceBytes: number
  }
  readonly case: string
  readonly count: number
  readonly cpu: {
    readonly aotModule?: { readonly cpuMicros: number }
    readonly firstCall: { readonly cpuMicros: number }
    readonly prepare: { readonly cpuMicros: number }
  }
  readonly implementation: string
  readonly memory: {
    readonly compilerPerSchema: Memory
    readonly module: Memory
    readonly retainedLibraryPerSchema: Memory
  }
  readonly round: number
}

type Memory = {
  readonly bytecodeBytes: number
  readonly codeBytes: number
  readonly externalSourceBytes: number
  readonly heapBytes: number
  readonly maxRssBytes: number
}

type Report = {
  readonly environment: Record<string, string>
  readonly measurement: {
    readonly cases: ReadonlyArray<string>
    readonly counts: ReadonlyArray<number>
    readonly implementations: ReadonlyArray<string>
    readonly rounds: number
  }
  readonly results: ReadonlyArray<Sample>
}

const path = resolve(process.argv[2] ?? "tmp/schema-compiler-resources.json")
const report = JSON.parse(readFileSync(path, "utf8")) as Report
const lowCount = Math.min(...report.measurement.counts)
const highCount = Math.max(...report.measurement.counts)
if (lowCount === highCount) throw new Error("the report needs at least two schema counts")

const median = (values: ReadonlyArray<number>) => {
  const sorted = values.toSorted((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

const samples = (implementation: string, caseName: string) => {
  const pairs = []
  for (let round = 0; round < report.measurement.rounds; round++) {
    const low = report.results.find((sample) =>
      sample.round === round && sample.implementation === implementation && sample.case === caseName &&
      sample.count === lowCount
    )
    const high = report.results.find((sample) =>
      sample.round === round && sample.implementation === implementation && sample.case === caseName &&
      sample.count === highCount
    )
    if (low === undefined || high === undefined) throw new Error(`missing samples for ${implementation}/${caseName}`)
    pairs.push({ high, low })
  }
  return pairs
}

const perSchemaSlope = (
  implementation: string,
  caseName: string,
  value: (sample: Sample) => number
) => median(samples(implementation, caseName).map(({ high, low }) =>
  (value(high) * highCount - value(low) * lowCount) / (highCount - lowCount)))

const totalSlope = (
  implementation: string,
  caseName: string,
  value: (sample: Sample) => number
) => median(samples(implementation, caseName).map(({ high, low }) =>
  (value(high) - value(low)) / (highCount - lowCount)))

const heap = (implementation: string, caseName: string) =>
  perSchemaSlope(implementation, caseName, (sample) => sample.memory.retainedLibraryPerSchema.heapBytes) / 1024
const code = (implementation: string, caseName: string) =>
  perSchemaSlope(
    implementation,
    caseName,
    (sample) => {
      const memory = sample.memory.retainedLibraryPerSchema
      return memory.bytecodeBytes + memory.codeBytes + memory.externalSourceBytes
    }
  ) / 1024
const peakRss = (implementation: string, caseName: string) =>
  perSchemaSlope(implementation, caseName, (sample) => sample.memory.retainedLibraryPerSchema.maxRssBytes) / 1024
const startupCpu = (implementation: string, caseName: string) =>
  totalSlope(
    implementation,
    caseName,
    (sample) =>
      sample.cpu.prepare.cpuMicros + sample.cpu.firstCall.cpuMicros +
      (implementation === "effect-aot" ? sample.cpu.aotModule?.cpuMicros ?? 0 : 0)
  )

const fixedDelta = (
  left: string,
  right: string,
  value: (sample: Sample) => number
) => {
  const differences = []
  for (const caseName of report.measurement.cases) {
    for (let round = 0; round < report.measurement.rounds; round++) {
      for (const count of report.measurement.counts) {
        const find = (implementation: string) => report.results.find((sample) =>
          sample.implementation === implementation && sample.case === caseName && sample.round === round &&
          sample.count === count
        )!
        differences.push(value(find(left)) - value(find(right)))
      }
    }
  }
  return median(differences)
}

const names: Record<string, string> = {
  "array-decode": "Array of 32 Structs",
  "default-make": "Construct 32 defaults",
  "struct-decode": "Struct decode",
  "struct-invalid": "Struct invalid decode",
  "struct-is": "Struct guard",
  "transform-decode": "32 transformations",
  "union-decode": "Discriminated Union (8)"
}

const table = (
  implementations: ReadonlyArray<string>,
  value: (implementation: string, caseName: string) => number,
  unit: string,
  digits: number
) => {
  const labels: Record<string, string> = {
    "effect-aot": "Effect AOT",
    "effect-interpreted": "Effect interpreted",
    "effect-jit": "Effect JIT",
    "valibot": "Valibot",
    "zod-compiled": "Zod compile",
    "zod-jitless": "Zod jitless"
  }
  const lines = [
    `| Case | ${implementations.map((implementation) => labels[implementation]).join(" | ")} |`,
    `|---|${implementations.map(() => "---:").join("|")}|`
  ]
  for (const caseName of report.measurement.cases) {
    lines.push(
      `| ${names[caseName]} | ${
        implementations.map((implementation) => `${value(implementation, caseName).toFixed(digits)} ${unit}`).join(" | ")
      } |`
    )
  }
  return lines.join("\n")
}

const interpreted = ["effect-interpreted", "valibot", "zod-jitless"]
const compiled = ["effect-jit", "effect-aot", "zod-compiled"]
const environment = report.environment

process.stdout.write(`# Schema compiler resource comparison

Incremental costs are median per-schema slopes between ${lowCount} and ${highCount} distinct schemas across ${
  report.measurement.rounds
} fresh-process rounds. Lower is better. Fixed module imports and fixture inputs are excluded.

Environment: Node ${environment.node}, V8 ${environment.v8}, ${environment.cpu}, ${environment.platform} ${
  environment.arch
}; Valibot ${environment.valibot}, Zod ${environment.zod}.

Importing the JIT compiler retains ${
  (fixedDelta("effect-jit", "effect-interpreted", (sample) => sample.memory.module.heapBytes) / 1024).toFixed(1)
} KiB of additional fixed JavaScript heap and ${
  (fixedDelta("effect-jit", "effect-interpreted", (sample) =>
    sample.memory.module.codeBytes + sample.memory.module.bytecodeBytes + sample.memory.module.externalSourceBytes) / 1024)
    .toFixed(1)
} KiB of V8 code, bytecode and source in this source-tree setup.

## Retained JavaScript heap

### Interpreted

${table(interpreted, heap, "KiB/schema", 2)}

### Compiled

${table(compiled, heap, "KiB/schema", 2)}

## Retained V8 code, bytecode and source

${table(compiled, code, "KiB/schema", 2)}

## Runtime preparation CPU

This includes adapter creation and the first call. AOT also includes importing and installing the generated module. AOT build-time generation is excluded.

### Interpreted

${table(interpreted, startupCpu, "µs/schema", 1)}

### Compiled

${table(compiled, startupCpu, "µs/schema", 1)}

## Peak runtime RSS growth

${table(compiled, peakRss, "KiB/schema", 1)}

## AOT build cost

| Case | CPU | Generated source | Peak RSS growth |
|---|---:|---:|---:|
${report.measurement.cases.map((caseName) => {
  const cpu = totalSlope(
    "effect-aot",
    caseName,
    (sample) => (sample.aotBuild?.schemaCpu.cpuMicros ?? 0) + (sample.aotBuild?.generateCpu.cpuMicros ?? 0)
  )
  const source = totalSlope("effect-aot", caseName, (sample) => sample.aotBuild?.sourceBytes ?? 0) / 1024
  const rss = totalSlope("effect-aot", caseName, (sample) => sample.aotBuild?.maxRssBytes ?? 0) / 1024
  return `| ${names[caseName]} | ${cpu.toFixed(1)} µs/schema | ${source.toFixed(2)} KiB/schema | ${rss.toFixed(1)} KiB/schema |`
}).join("\n")}
`)
