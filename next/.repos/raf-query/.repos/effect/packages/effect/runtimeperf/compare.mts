import { spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs"
import os from "node:os"
import { dirname, join } from "node:path"
import process from "node:process"
import { materializeFixture } from "./materialize.mts"
import { analyzePairs } from "./stats.mts"
import {
  aggregateMeasurements,
  calibrateFixture,
  comparePath,
  configPath,
  coverageSummary,
  effectDir,
  formatNs,
  hashFile,
  libraryVersions,
  loadRegistry,
  makeRunId,
  materializePath,
  measureFixture,
  parseArgs,
  printTable,
  relativeToRepo,
  repoRoot,
  reportPath,
  resolveDefaults,
  selectFixtures,
  sha256,
  statsPath,
  utilsPath,
  workerPath,
  writeJson
} from "./utils.mts"
import { applyWorktreeDiff, readWorktreeDiff } from "./worktree-diff.mts"

const usage = `Usage: pnpm runtimeperf-compare [suite[/fixture]|scenario] [options]

Options:
  --base <ref>          Defaults to HEAD
  --head <ref>          Defaults to worktree
  --rounds <n>
  --time <ms>
  --warmup-time <ms>
  --tier <0-3>
  --family <name>
  --fail-on-regression
`

const run = (command, args, options = {}) =>
  spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    ...options
  })

const runGit = (args) => {
  const result = run("git", args, { cwd: repoRoot })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${result.stdout}${result.stderr}`.trim())
  }
  return result.stdout.trim()
}

const resolveRef = (ref) => runGit(["rev-parse", "--verify", `${ref}^{commit}`])

const linkDirectory = (source, target) => {
  if (!existsSync(target)) {
    symlinkSync(source, target, process.platform === "win32" ? "junction" : "dir")
  }
}

const removeWorktree = (path) => {
  const result = run("git", ["worktree", "remove", "--force", path], { cwd: repoRoot })
  if (result.status !== 0) {
    process.stderr.write(`${result.stdout}${result.stderr}`)
  }
}

const createWorktree = (runRoot, name, sha) => {
  const path = join(runRoot, name)
  const result = run("git", ["worktree", "add", "--detach", path, sha], { cwd: repoRoot })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${result.stdout}${result.stderr}`.trim())
  }
  try {
    linkDirectory(join(repoRoot, "node_modules"), join(path, "node_modules"))
    linkDirectory(join(effectDir, "node_modules"), join(path, "packages", "effect", "node_modules"))
  } catch (error) {
    removeWorktree(path)
    throw error
  }
  return path
}

const applyWorktreeChanges = (path, untracked) => {
  applyWorktreeDiff(path, readWorktreeDiff(repoRoot))
  for (const file of untracked) {
    const target = join(path, file.path)
    mkdirSync(dirname(target), { recursive: true })
    cpSync(join(repoRoot, file.path), target, { recursive: true })
  }
}

const worktreeState = () => {
  const diff = readWorktreeDiff(repoRoot)
  const untrackedOutput = runGit([
    "ls-files",
    "--others",
    "--exclude-standard",
    "--",
    "package.json",
    "packages/effect"
  ])
  const untracked = untrackedOutput === ""
    ? []
    : untrackedOutput.split("\n").map((path) => ({
      path,
      hash: hashFile(join(repoRoot, path))
    }))
  return {
    dirty: diff !== "" || untracked.length > 0,
    diffHash: sha256(diff),
    untracked
  }
}

const main = () => {
  const options = parseArgs(process.argv.slice(2), { compare: true })
  if (options.help) {
    process.stdout.write(usage)
    return
  }
  const { config, fixtures } = loadRegistry()
  const selected = selectFixtures(fixtures, options, { effectOnly: true })
  const defaults = resolveDefaults(config, options)
  const baseSha = resolveRef(options.base)
  const headSha = options.head === "worktree" ? resolveRef("HEAD") : resolveRef(options.head)
  const state = worktreeState()
  const runId = makeRunId()
  const tmpRoot = join(repoRoot, "tmp", "runtimeperf", "worktrees")
  mkdirSync(tmpRoot, { recursive: true })
  const runRoot = mkdtempSync(join(tmpRoot, "run-"))
  const worktrees = []
  const results = []
  const executionOrder = []

  try {
    const baseRoot = createWorktree(runRoot, "base", baseSha)
    worktrees.push(baseRoot)
    const headRoot = createWorktree(runRoot, "head", headSha)
    worktrees.push(headRoot)
    if (options.head === "worktree") applyWorktreeChanges(headRoot, state.untracked)

    for (const fixture of selected) {
      const baseFixturePath = materializeFixture(baseRoot, fixture)
      const headFixturePath = materializeFixture(headRoot, fixture)
      const baseCalibration = calibrateFixture(fixture, defaults, baseFixturePath)
      const headCalibration = calibrateFixture(fixture, defaults, headFixturePath)
      const batchSize = Math.max(baseCalibration.batchSize, headCalibration.batchSize)
      const baseMeasurements = []
      const headMeasurements = []

      for (let round = 0; round < defaults.rounds; round++) {
        const order = round % 2 === 0 ? ["base", "head"] : ["head", "base"]
        for (const side of order) {
          const measurement = side === "base"
            ? measureFixture(fixture, defaults, batchSize, baseFixturePath)
            : measureFixture(fixture, defaults, batchSize, headFixturePath)
          ;(side === "base" ? baseMeasurements : headMeasurements).push(measurement)
          executionOrder.push({ target: fixture.target, round: round + 1, side })
        }
      }

      results.push({
        fixture,
        batchSize,
        calibration: {
          base: baseCalibration,
          head: headCalibration
        },
        base: {
          measurements: baseMeasurements,
          aggregate: aggregateMeasurements(baseMeasurements)
        },
        head: {
          measurements: headMeasurements,
          aggregate: aggregateMeasurements(headMeasurements)
        },
        comparison: analyzePairs(
          baseMeasurements.map((item) => item.nsPerOp),
          headMeasurements.map((item) => item.nsPerOp),
          {
            iterations: defaults.bootstrapIterations,
            seed: defaults.bootstrapSeed,
            minImprovementPercent: defaults.minImprovementPercent,
            maxRegressionPercent: defaults.maxRegressionPercent
          }
        )
      })
    }
  } finally {
    for (const worktree of worktrees.reverse()) {
      removeWorktree(worktree)
    }
    rmSync(runRoot, { recursive: true, force: true })
  }

  const report = {
    schemaVersion: 1,
    kind: "comparison",
    runId,
    target: options.target ?? null,
    filters: {
      tier: options.tier ?? null,
      family: options.family ?? null
    },
    config: defaults,
    base: {
      ref: options.base,
      sha: baseSha
    },
    head: {
      ref: options.head,
      sha: headSha,
      worktree: options.head === "worktree" ? state : undefined
    },
    environment: {
      node: process.version,
      v8: process.versions.v8,
      platform: process.platform,
      arch: process.arch,
      cpu: os.cpus()[0]?.model ?? "unknown"
    },
    libraries: libraryVersions(),
    artifactMode: "repository",
    coverage: coverageSummary(selected),
    hashes: {
      compare: hashFile(comparePath),
      config: hashFile(configPath),
      materialize: hashFile(materializePath),
      stats: hashFile(statsPath),
      utils: hashFile(utilsPath),
      worker: hashFile(workerPath),
      fixtures: Object.fromEntries(
        [...new Set(selected.map((fixture) => fixture.fixturePath))]
          .map((path) => [relativeToRepo(path), hashFile(path)])
      )
    },
    executionOrder,
    results
  }
  const path = reportPath(runId, options.target, "compare")
  writeJson(path, report)
  printTable(
    ["fixture", "base", "head", "delta", "ci low", "ci high", "status"],
    results.map((result) => [
      result.fixture.target,
      formatNs(result.base.aggregate.median),
      formatNs(result.head.aggregate.median),
      `${result.comparison.deltaPercent.toFixed(2)}%`,
      `${result.comparison.lowPercent.toFixed(2)}%`,
      `${result.comparison.highPercent.toFixed(2)}%`,
      result.comparison.status
    ])
  )
  process.stdout.write(`\nReport: ${relativeToRepo(path)}\n`)
  if (options.failOnRegression && results.some((result) => result.comparison.status === "regression")) {
    process.exitCode = 1
  }
}

try {
  main()
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : error}\n`)
  process.exitCode = 1
}
