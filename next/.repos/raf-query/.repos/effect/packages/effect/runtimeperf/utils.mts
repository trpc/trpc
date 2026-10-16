import { spawnSync } from "node:child_process"
import { createHash, randomBytes } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { aggregate } from "./stats.mts"

export const runtimeperfDir = dirname(fileURLToPath(import.meta.url))
export const effectDir = resolve(runtimeperfDir, "..")
export const repoRoot = resolve(effectDir, "../..")
export const runPath = join(runtimeperfDir, "run.mts")
export const comparePath = join(runtimeperfDir, "compare.mts")
export const materializePath = join(runtimeperfDir, "materialize.mts")
export const statsPath = join(runtimeperfDir, "stats.mts")
export const utilsPath = fileURLToPath(import.meta.url)
export const workerPath = join(runtimeperfDir, "worker.mts")
export const configPath = join(runtimeperfDir, "config.json")
export const resultsRoot = join(repoRoot, "tmp", "runtimeperf", "results")

export const readJson = (path) => JSON.parse(readFileSync(path, "utf8"))

export const writeJson = (path, value) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

export const sha256 = (value) => createHash("sha256").update(value).digest("hex")

export const hashFile = (path) => sha256(readFileSync(path))

export const libraryVersions = () => ({
  effect: readJson(join(effectDir, "package.json")).version,
  fastCheck: readJson(join(repoRoot, "node_modules", "fast-check", "package.json")).version,
  tinybench: readJson(join(effectDir, "node_modules", "tinybench", "package.json")).version,
  valibot: readJson(join(effectDir, "node_modules", "valibot", "package.json")).version,
  zod: readJson(join(repoRoot, "node_modules", "zod", "package.json")).version,
  zodExport: "zod/v4"
})

export const currentGitState = () => {
  const git = (args) => {
    const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" })
    if (result.error) throw result.error
    if (result.status !== 0) {
      throw new Error(`${result.stdout}${result.stderr}`.trim())
    }
    return result.stdout.trim()
  }
  const status = git(["status", "--short", "--untracked-files=all"])
  const diff = git(["diff", "--binary", "HEAD", "--"])
  return {
    sha: git(["rev-parse", "HEAD"]),
    dirty: status !== "",
    status: status === "" ? [] : status.split("\n"),
    diffHash: sha256(diff)
  }
}

export const makeRunId = () =>
  `${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}-${randomBytes(3).toString("hex")}`

export const sanitize = (name) => name.replace(/[^a-zA-Z0-9._-]/g, "-")

export const parseArgs = (args, { compare = false } = {}) => {
  const options = {
    target: undefined,
    rounds: undefined,
    timeMs: undefined,
    warmupTimeMs: undefined,
    tier: undefined,
    family: undefined,
    implementation: undefined,
    base: "HEAD",
    head: "worktree",
    failOnRegression: false,
    help: false
  }
  const valueOptions = new Map([
    ["--rounds", "rounds"],
    ["--time", "timeMs"],
    ["--warmup-time", "warmupTimeMs"],
    ["--tier", "tier"],
    ["--family", "family"],
    ["--implementation", "implementation"],
    ["--base", "base"],
    ["--head", "head"]
  ])
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === "--help" || arg === "-h") {
      options.help = true
    } else if (arg === "--fail-on-regression" && compare) {
      options.failOnRegression = true
    } else if (valueOptions.has(arg)) {
      const value = args[++index]
      if (value === undefined || value.startsWith("-")) {
        throw new Error(`Missing value for ${arg}`)
      }
      options[valueOptions.get(arg)] = value
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`)
    } else if (options.target === undefined) {
      options.target = arg
    } else {
      throw new Error(`Expected at most one target, got ${options.target} and ${arg}`)
    }
  }
  for (const key of ["rounds", "timeMs", "warmupTimeMs", "tier"]) {
    if (options[key] !== undefined) {
      const value = Number(options[key])
      if (!Number.isInteger(value) || value < 0 || (key !== "tier" && value === 0)) {
        throw new Error(`--${key} must be ${key === "tier" ? "a non-negative" : "a positive"} integer`)
      }
      options[key] = value
    }
  }
  return options
}

export const loadRegistry = () => {
  const config = readJson(configPath)
  const fixtures = config.suites.flatMap((suite) =>
    suite.fixtures.flatMap((fixtureGroup) =>
      fixtureGroup.cases.map((runtimeCase) => ({
        ...fixtureGroup.defaults,
        ...runtimeCase,
        suite: suite.name,
        target: `${suite.name}/${runtimeCase.name}`,
        fixturePath: resolve(runtimeperfDir, fixtureGroup.file)
      }))
    )
  )
  return { config, fixtures }
}

export const selectFixtures = (fixtures, options, { effectOnly = false } = {}) => {
  let selected = fixtures
  if (options.target !== undefined) {
    selected = selected.filter((fixture) =>
      fixture.suite === options.target ||
      fixture.target === options.target ||
      fixture.scenario === options.target
    )
  }
  if (options.tier !== undefined) {
    selected = selected.filter((fixture) => fixture.tier === options.tier)
  }
  if (options.family !== undefined) {
    selected = selected.filter((fixture) => fixture.family === options.family)
  }
  if (options.implementation !== undefined) {
    selected = selected.filter((fixture) => fixture.implementation === options.implementation)
  }
  if (effectOnly) {
    selected = selected.filter((fixture) => fixture.implementation.startsWith("effect"))
  }
  if (selected.length === 0) {
    throw new Error("No runtimeperf fixtures matched the selection")
  }
  return selected
}

export const resolveDefaults = (config, options) => ({
  rounds: options.rounds ?? config.defaults.rounds,
  timeMs: options.timeMs ?? config.defaults.timeMs,
  warmupTimeMs: options.warmupTimeMs ?? config.defaults.warmupTimeMs,
  targetBatchTimeNs: config.defaults.targetBatchTimeNs,
  maxBatchSize: config.defaults.maxBatchSize,
  bootstrapIterations: config.defaults.bootstrapIterations,
  bootstrapSeed: config.defaults.bootstrapSeed,
  minImprovementPercent: config.defaults.minImprovementPercent,
  maxRegressionPercent: config.defaults.maxRegressionPercent
})

export const runWorker = (workerArgs) => {
  const result = spawnSync(process.execPath, [workerPath, ...workerArgs], {
    cwd: effectDir,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${result.stderr || result.stdout}`.trim())
  }
  try {
    return JSON.parse(result.stdout)
  } catch {
    throw new Error(`Worker returned invalid JSON: ${result.stdout}`)
  }
}

export const calibrateFixture = (fixture, defaults, fixturePath = fixture.fixturePath) =>
  runWorker([
    "--mode",
    "calibrate",
    "--fixture",
    fixturePath,
    "--export",
    fixture.export,
    "--target-batch-time-ns",
    String(defaults.targetBatchTimeNs),
    "--max-batch-size",
    String(defaults.maxBatchSize)
  ])

export const measureFixture = (fixture, defaults, batchSize, fixturePath = fixture.fixturePath) =>
  runWorker([
    "--mode",
    "measure",
    "--fixture",
    fixturePath,
    "--export",
    fixture.export,
    "--batch-size",
    String(batchSize),
    "--time-ms",
    String(defaults.timeMs),
    "--warmup-time-ms",
    String(defaults.warmupTimeMs)
  ])

export const aggregateMeasurements = (measurements) => aggregate(measurements.map((item) => item.nsPerOp))

export const scenarioBatchSize = (fixtures, calibrations) => {
  const reference = fixtures.find((fixture) => fixture.implementation === "effect") ?? fixtures[0]
  const calibration = calibrations.get(reference)
  if (calibration === undefined) throw new Error("Missing scenario reference calibration")
  return calibration.batchSize
}

export const coverageSummary = (fixtures) => ({
  tiers: [...new Set(fixtures.map((fixture) => fixture.tier))].sort(),
  families: [...new Set(fixtures.map((fixture) => fixture.family))].sort(),
  implementations: [...new Set(fixtures.map((fixture) => fixture.implementation))].sort(),
  effectAstTags: [
    ...new Set(
      fixtures
        .filter((fixture) => fixture.implementation.startsWith("effect"))
        .flatMap((fixture) => fixture.astTags)
    )
  ].sort()
})

export const formatNs = (value) => value < 1_000
  ? value.toFixed(1)
  : value < 1_000_000
  ? `${(value / 1_000).toFixed(2)}µs`
  : `${(value / 1_000_000).toFixed(2)}ms`

export const printTable = (headers, rows) => {
  const textRows = rows.map((row) => row.map(String))
  const table = [headers, ...textRows]
  const widths = headers.map((_, index) => Math.max(...table.map((row) => row[index].length)))
  table.forEach((row, index) => {
    process.stdout.write(`${row.map((cell, cellIndex) => cell.padEnd(widths[cellIndex])).join("  ")}\n`)
    if (index === 0) {
      process.stdout.write(`${widths.map((width) => "-".repeat(width)).join("  ")}\n`)
    }
  })
}

export const reportPath = (runId, target, kind) =>
  join(resultsRoot, `${runId}-${kind}-${sanitize(target ?? "all")}.json`)

export const relativeToRepo = (path) => relative(repoRoot, path)
