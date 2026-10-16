import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { httpapi } from "./compare/httpapi.mjs"

const require = createRequire(import.meta.url)
const args = process.argv.slice(2)
const help = args.includes("--help") || args.includes("-h")

if (help) {
  console.log(`Usage: pnpm typeperf-compare [suite[/fixture]] [--base <ref>] [--head <ref>]

Options:
  --base <ref>  Base Git ref. Defaults to main.
  --head <ref>  Head Git ref. Defaults to HEAD.
`)
  process.exit(0)
}

let baseRef = "main"
let headRef = "HEAD"
const targets = []

for (let index = 0; index < args.length; index++) {
  const arg = args[index]
  if (arg === "--base" || arg === "--head") {
    const value = args[++index]
    if (value === undefined || value.startsWith("-")) {
      console.error(`Missing value for ${arg}`)
      process.exit(1)
    }
    if (arg === "--base") {
      baseRef = value
    } else {
      headRef = value
    }
  } else if (arg.startsWith("-")) {
    console.error(`Unknown option: ${arg}`)
    process.exit(1)
  } else {
    targets.push(arg)
  }
}

if (targets.length > 1) {
  console.error(`Expected at most one target, got: ${targets.join(", ")}`)
  process.exit(1)
}

const typeperfDir = dirname(fileURLToPath(import.meta.url))
const effectDir = resolve(typeperfDir, "..")
const repoRoot = resolve(effectDir, "../..")
const tmpRoot = join(repoRoot, "tmp", "typeperf-compare")
const worktreesRoot = join(tmpRoot, "worktrees")
const resultsRoot = join(tmpRoot, "results")
const suites = [httpapi]
const selectedTarget = targets[0]
const [selectedSuiteName, selectedFixtureName] = selectedTarget === undefined ? [] : selectedTarget.split("/")

if (selectedTarget !== undefined && (selectedSuiteName === "" || selectedFixtureName === "")) {
  console.error(`Invalid target: ${selectedTarget}`)
  process.exit(1)
}

const run = (command, commandArgs, options = {}) =>
  spawnSync(command, commandArgs, {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    ...options
  })

const runGit = (gitArgs) => {
  const result = run("git", gitArgs, { cwd: repoRoot })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`${result.stdout ?? ""}${result.stderr ?? ""}`.trim())
  }
  return result.stdout.trim()
}

const resolveRef = (ref) => runGit(["rev-parse", "--verify", `${ref}^{commit}`])

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"))

const writeJson = (path, value) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

const writeSource = (path, source) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, source.endsWith("\n") ? source : `${source}\n`)
}

const sanitize = (name) => name.replace(/[^a-zA-Z0-9._-]/g, "-")

const suiteHash = (suite) => {
  const hash = createHash("sha256")
  hash.update(`baseline.ts\0${suite.baseline}\0`)
  for (const fixture of suite.fixtures) {
    hash.update(`fixtures/${fixture.name}.ts\0${fixture.source}\0`)
  }
  return hash.digest("hex")
}

const typescriptPackagePath = require.resolve("typescript/package.json")
const typescriptDir = dirname(typescriptPackagePath)
const typescriptVersion = readJson(typescriptPackagePath).version
const tscPath = join(typescriptDir, "lib", "tsc.js")

const linkDirectory = (source, target) => {
  if (existsSync(target)) {
    return
  }
  symlinkSync(source, target, process.platform === "win32" ? "junction" : "dir")
}

const materializeSuite = (targetRepoRoot, suite) => {
  const targetEffectDir = join(targetRepoRoot, "packages", "effect")
  const suiteDir = join(targetEffectDir, ".typeperf-compare", suite.name)
  writeSource(join(suiteDir, "baseline.ts"), suite.baseline)
  for (const fixture of suite.fixtures) {
    writeSource(join(suiteDir, "fixtures", `${fixture.name}.ts`), fixture.source)
  }
  return {
    effectDir: targetEffectDir,
    suiteDir
  }
}

const writeTempTsconfig = (target, suiteName, subjectName, sourcePath) => {
  const configDir = join(target.effectDir, ".typeperf-compare", "configs")
  const tsconfigPath = join(configDir, `${sanitize(`${suiteName}-${subjectName}`)}.json`)
  writeJson(tsconfigPath, {
    extends: join(target.effectDir, "tsconfig.json"),
    files: [sourcePath],
    include: [],
    compilerOptions: {
      noEmit: true,
      declaration: false,
      declarationMap: false,
      sourceMap: false,
      plugins: [],
      rootDir: target.effectDir,
      incremental: false,
      composite: false
    }
  })
  return tsconfigPath
}

const readMetric = (output, metric) => {
  const match = output.match(new RegExp(`^${metric}:\\s+(\\d+)$`, "m"))
  return match === null ? undefined : Number(match[1])
}

const measure = (target, suiteName, subjectName, sourcePath) => {
  const tsconfigPath = writeTempTsconfig(target, suiteName, subjectName, sourcePath)
  const result = run(process.execPath, [tscPath, "-p", tsconfigPath, "--extendedDiagnostics", "--noEmit"], {
    cwd: target.effectDir
  })
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`
  if (result.error) {
    return { ok: false, error: result.error.message, output }
  }
  if (result.status !== 0) {
    return {
      ok: false,
      exitCode: result.status,
      signal: result.signal ?? undefined,
      output
    }
  }
  const instantiations = readMetric(output, "Instantiations")
  const types = readMetric(output, "Types")
  const symbols = readMetric(output, "Symbols")
  if (instantiations === undefined || types === undefined || symbols === undefined) {
    return { ok: false, error: "Could not read extended diagnostics", output }
  }
  return {
    ok: true,
    diagnostics: { instantiations, types, symbols }
  }
}

const subtractDiagnostics = (total, baseline) => ({
  instantiations: total.instantiations - baseline.instantiations,
  types: total.types - baseline.types,
  symbols: total.symbols - baseline.symbols
})

const failureLabel = (measurement) => {
  if (measurement.signal !== undefined) {
    return `signal:${measurement.signal}`
  }
  if (measurement.exitCode !== undefined) {
    return `exit:${measurement.exitCode}`
  }
  return measurement.error ?? "failed"
}

const formatNumber = (value) => value.toLocaleString("en-US")
const formatSigned = (value) => value === 0 ? "0" : `${value > 0 ? "+" : ""}${formatNumber(value)}`

const printTable = (rows) => {
  const table = [
    ["suite", "fixture", "baseInst", "headInst", "instDiff", "baseTypes", "headTypes", "typesDiff", "symbolsDiff", "status"],
    ...rows.map((row) => [
      row.suite,
      row.fixture,
      row.base?.instantiations === undefined ? "-" : formatNumber(row.base.instantiations),
      row.head?.instantiations === undefined ? "-" : formatNumber(row.head.instantiations),
      row.diff?.instantiations === undefined ? "-" : formatSigned(row.diff.instantiations),
      row.base?.types === undefined ? "-" : formatNumber(row.base.types),
      row.head?.types === undefined ? "-" : formatNumber(row.head.types),
      row.diff?.types === undefined ? "-" : formatSigned(row.diff.types),
      row.diff?.symbols === undefined ? "-" : formatSigned(row.diff.symbols),
      row.status
    ])
  ]
  const widths = table[0].map((_, index) => Math.max(...table.map((row) => row[index].length)))
  for (const [index, row] of table.entries()) {
    console.log(row.map((cell, cellIndex) => cell.padEnd(widths[cellIndex])).join("  "))
    if (index === 0) {
      console.log(widths.map((width) => "-".repeat(width)).join("  "))
    }
  }
}

const createWorktree = (runRoot, name, sha) => {
  const path = join(runRoot, name)
  runGit(["worktree", "add", "--detach", path, sha])
  try {
    linkDirectory(join(repoRoot, "node_modules"), join(path, "node_modules"))
    linkDirectory(join(effectDir, "node_modules"), join(path, "packages", "effect", "node_modules"))
  } catch (error) {
    removeWorktree(path)
    throw error
  }
  return path
}

const removeWorktree = (path) => {
  const result = run("git", ["worktree", "remove", "--force", path], { cwd: repoRoot })
  if (result.status !== 0) {
    process.stderr.write(`${result.stdout ?? ""}${result.stderr ?? ""}`)
  }
}

const main = () => {
  const baseSha = resolveRef(baseRef)
  const headSha = resolveRef(headRef)
  mkdirSync(worktreesRoot, { recursive: true })
  const runRoot = mkdtempSync(join(worktreesRoot, "run-"))
  const worktrees = []
  const rows = []
  let failed = false

  try {
    const baseWorktree = createWorktree(runRoot, "base", baseSha)
    worktrees.push(baseWorktree)
    const headWorktree = createWorktree(runRoot, "head", headSha)
    worktrees.push(headWorktree)

    const baseTargetRoot = materializeSuite(baseWorktree, httpapi)
    const headTargetRoot = materializeSuite(headWorktree, httpapi)
    const matchedSuites = suites.filter((suite) => selectedSuiteName === undefined || suite.name === selectedSuiteName)
    if (matchedSuites.length === 0) {
      throw new Error(`Unknown comparison suite: ${selectedSuiteName}`)
    }

    for (const suite of matchedSuites) {
      const baseTarget = suite.name === httpapi.name ? baseTargetRoot : materializeSuite(baseWorktree, suite)
      const headTarget = suite.name === httpapi.name ? headTargetRoot : materializeSuite(headWorktree, suite)
      const baselineRelativePath = "baseline.ts"
      const baseBaseline = measure(
        baseTarget,
        suite.name,
        "baseline",
        join(baseTarget.suiteDir, baselineRelativePath)
      )
      const headBaseline = measure(
        headTarget,
        suite.name,
        "baseline",
        join(headTarget.suiteDir, baselineRelativePath)
      )
      if (!baseBaseline.ok || !headBaseline.ok) {
        if (!baseBaseline.ok) {
          process.stderr.write(baseBaseline.output)
        }
        if (!headBaseline.ok) {
          process.stderr.write(headBaseline.output)
        }
        throw new Error(`Baseline failed for comparison suite ${suite.name}`)
      }

      const fixtures = suite.fixtures.filter((fixture) =>
        selectedFixtureName === undefined || fixture.name === selectedFixtureName
      )
      if (selectedFixtureName !== undefined && fixtures.length === 0) {
        throw new Error(`Unknown comparison fixture: ${suite.name}/${selectedFixtureName}`)
      }

      for (const fixture of fixtures) {
        const baseMeasurement = measure(
          baseTarget,
          suite.name,
          fixture.name,
          join(baseTarget.suiteDir, "fixtures", `${fixture.name}.ts`)
        )
        const headMeasurement = measure(
          headTarget,
          suite.name,
          fixture.name,
          join(headTarget.suiteDir, "fixtures", `${fixture.name}.ts`)
        )
        let base
        let head
        let diff
        let status

        if (baseMeasurement.ok && headMeasurement.ok) {
          base = subtractDiagnostics(baseMeasurement.diagnostics, baseBaseline.diagnostics)
          head = subtractDiagnostics(headMeasurement.diagnostics, headBaseline.diagnostics)
          diff = subtractDiagnostics(head, base)
          status = "ok"
        } else if (!baseMeasurement.ok && headMeasurement.ok) {
          head = subtractDiagnostics(headMeasurement.diagnostics, headBaseline.diagnostics)
          status = `base:${failureLabel(baseMeasurement)}`
          failed = true
        } else if (baseMeasurement.ok && !headMeasurement.ok) {
          base = subtractDiagnostics(baseMeasurement.diagnostics, baseBaseline.diagnostics)
          status = `head:${failureLabel(headMeasurement)}`
          failed = true
        } else {
          status = `base:${failureLabel(baseMeasurement)},head:${failureLabel(headMeasurement)}`
          failed = true
        }

        if (!baseMeasurement.ok && baseMeasurement.output !== "") {
          process.stderr.write(baseMeasurement.output)
        }
        if (!headMeasurement.ok && headMeasurement.output !== "") {
          process.stderr.write(headMeasurement.output)
        }
        rows.push({ suite: suite.name, fixture: fixture.name, base, head, diff, status })
      }
    }

    const report = {
      compiler: {
        name: "typescript",
        version: typescriptVersion
      },
      base: { ref: baseRef, sha: baseSha },
      head: { ref: headRef, sha: headSha },
      target: selectedTarget ?? null,
      suites: matchedSuites.map((suite) => ({ name: suite.name, hash: suiteHash(suite) })),
      rows
    }
    const reportTarget = sanitize(selectedTarget ?? "all")
    const reportName = `${baseSha.slice(0, 12)}..${headSha.slice(0, 12)}-${reportTarget}.json`
    const reportPath = join(resultsRoot, reportName)
    writeJson(reportPath, report)
    printTable(rows)
    console.log(`\nReport: ${relative(repoRoot, reportPath)}`)
  } finally {
    for (const worktree of worktrees.reverse()) {
      removeWorktree(worktree)
    }
    rmSync(runRoot, { recursive: true, force: true })
  }

  if (failed) {
    process.exitCode = 1
  }
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
