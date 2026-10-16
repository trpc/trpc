import os from "node:os"
import process from "node:process"
import { analyzePairs } from "./stats.mts"
import {
  aggregateMeasurements,
  calibrateFixture,
  configPath,
  coverageSummary,
  currentGitState,
  formatNs,
  hashFile,
  libraryVersions,
  loadRegistry,
  makeRunId,
  measureFixture,
  parseArgs,
  printTable,
  relativeToRepo,
  reportPath,
  resolveDefaults,
  runPath,
  scenarioBatchSize,
  selectFixtures,
  statsPath,
  utilsPath,
  workerPath,
  writeJson
} from "./utils.mts"

const usage = `Usage: pnpm runtimeperf [suite[/fixture]|scenario] [options]

Options:
  --rounds <n>
  --time <ms>
  --warmup-time <ms>
  --tier <0-3>
  --family <name>
  --implementation <effect|effect-jit|effect-aot|fast-check-v4|valibot|zod4|zod4-jitless|zod4-validate|zod4-compiled>
`

const rotate = (items, offset) => items.map((_, index) => items[(index + offset) % items.length])

const main = () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(usage)
    return
  }
  const { config, fixtures } = loadRegistry()
  const selected = selectFixtures(fixtures, options)
  const defaults = resolveDefaults(config, options)
  const runId = makeRunId()
  const groups = Map.groupBy(selected, (fixture) => fixture.scenario)
  const results = []
  const executionOrder = []

  for (const [scenario, group] of groups) {
    const calibrations = new Map(group.map((fixture) => [fixture, calibrateFixture(fixture, defaults)]))
    const batchSize = scenarioBatchSize(group, calibrations)
    const byTarget = new Map(group.map((fixture) => [fixture.target, []]))

    for (let round = 0; round < defaults.rounds; round++) {
      for (const fixture of rotate(group, round % group.length)) {
        const measurement = measureFixture(fixture, defaults, batchSize)
        byTarget.get(fixture.target).push(measurement)
        executionOrder.push({ scenario, round: round + 1, target: fixture.target })
      }
    }

    for (const fixture of group) {
      const calibration = calibrations.get(fixture)
      const measurements = byTarget.get(fixture.target)
      results.push({
        fixture,
        batchSize,
        calibration,
        measurements,
        aggregate: aggregateMeasurements(measurements)
      })
    }
  }

  const crossLibrary = []
  for (const [scenario, group] of Map.groupBy(results, (result) => result.fixture.scenario)) {
    const effect = group.find((result) => result.fixture.implementation === "effect")
    if (!effect) continue
    for (const candidate of group) {
      if (candidate.fixture.implementation === "effect") continue
      crossLibrary.push({
        scenario,
        implementation: candidate.fixture.implementation,
        comparison: analyzePairs(
          effect.measurements.map((item) => item.nsPerOp),
          candidate.measurements.map((item) => item.nsPerOp),
          {
            iterations: defaults.bootstrapIterations,
            seed: defaults.bootstrapSeed
          }
        )
      })
    }
  }

  const report = {
    schemaVersion: 1,
    kind: "single",
    runId,
    target: options.target ?? null,
    filters: {
      tier: options.tier ?? null,
      family: options.family ?? null,
      implementation: options.implementation ?? null
    },
    config: defaults,
    environment: {
      node: process.version,
      v8: process.versions.v8,
      platform: process.platform,
      arch: process.arch,
      cpu: os.cpus()[0]?.model ?? "unknown"
    },
    libraries: libraryVersions(),
    artifactMode: "repository",
    git: currentGitState(),
    coverage: coverageSummary(selected),
    hashes: {
      config: hashFile(configPath),
      run: hashFile(runPath),
      stats: hashFile(statsPath),
      utils: hashFile(utilsPath),
      worker: hashFile(workerPath),
      fixtures: Object.fromEntries(
        [...new Set(selected.map((fixture) => fixture.fixturePath))]
          .map((path) => [relativeToRepo(path), hashFile(path)])
      )
    },
    executionOrder,
    results,
    crossLibrary
  }
  const path = reportPath(runId, options.target, "single")
  writeJson(path, report)
  const comparisons = new Map(crossLibrary.map((item) => [`${item.scenario}/${item.implementation}`, item]))
  printTable(
    ["scenario", "family", "implementation", "ns/op", "mad", "vs Effect"],
    results.map((result) => {
      const comparison = comparisons.get(`${result.fixture.scenario}/${result.fixture.implementation}`)
      return [
        result.fixture.scenario,
        result.fixture.family,
        result.fixture.implementation,
        formatNs(result.aggregate.median),
        formatNs(result.aggregate.mad),
        comparison ? `${comparison.comparison.ratio.toFixed(3)}x` : "-"
      ]
    })
  )
  process.stdout.write(`\nReport: ${relativeToRepo(path)}\n`)
}

try {
  main()
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : error}\n`)
  process.exitCode = 1
}
